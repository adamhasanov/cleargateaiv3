import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { SYSTEM_PROMPT, userInstruction } from "./prompt";
import { ExtractionError, type ExtractionInput, type ExtractionProvider } from "./provider";
import { extractionSchema, type RawExtraction } from "./schema";

const RESPONSE_JSON_SCHEMA = z.toJSONSchema(extractionSchema);

const DEFAULT_MODEL = "gemini-3.8-flash";
/**
 * Tried in order when the model before is overloaded, rate-limited, retired or
 * too slow. All of them read the same prompt and schema; none is "smarter" at
 * comparing, because comparing is done by the rule engine, never the model.
 */
const FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

/** Whole-request budget, kept under the route's maxDuration (60 s). */
const TOTAL_BUDGET_MS = 52_000;
/** One attempt may not use the whole budget, so a fallback still has time. */
const ATTEMPT_TIMEOUT_MS = 22_000;
/** Below this, another attempt cannot realistically finish. */
const MIN_ATTEMPT_MS = 8_000;

/** Overloaded (503), rate-limited (429), server errors, or a model this key can no longer use (404). */
const RETRYABLE_STATUS = new Set([404, 429, 500, 502, 503, 504]);

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return RETRYABLE_STATUS.has(error.status);
  // Our own per-attempt timeout, or a dropped connection.
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /fetch failed|network/i.test(error.message));
}

/** Pause between rounds when every model was busy; Google's suggested retryDelay wins if present. */
const DEFAULT_ROUND_PAUSE_MS = 4_000;
const MAX_ROUND_PAUSE_MS = 15_000;

/** A 429 asking to wait longer than this is a used-up quota (e.g. the free tier's daily cap), not a short burst limit. */
const LONG_QUOTA_MS = 60_000;

/**
 * Models whose quota is used up, and until when. Shared by all requests in this
 * server process, so later checks skip them at once instead of asking again.
 */
const exhaustedUntil = new Map<string, number>();
const isExhausted = (model: string) => (exhaustedUntil.get(model) ?? 0) > Date.now();

/** The wait Google suggests in a 429, e.g. "retryDelay":"7s"; null if none is given. */
function retryDelayMs(error: unknown): number | null {
  const match = error instanceof ApiError ? /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(error.message) : null;
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
}

/** Pause before the next round when every model was briefly busy. */
function suggestedPauseMs(error: unknown): number {
  const ms = retryDelayMs(error) ?? DEFAULT_ROUND_PAUSE_MS;
  return Math.min(Math.max(ms, 1_000), MAX_ROUND_PAUSE_MS);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Google Gemini extraction provider (works with a free Google AI Studio key). */
export class GeminiExtractionProvider implements ExtractionProvider {
  readonly name = "gemini";
  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  private models = [...new Set([process.env.CLEARGATE_EXTRACTION_MODEL?.trim() || DEFAULT_MODEL, ...FALLBACK_MODELS])];

  async extract(input: ExtractionInput): Promise<RawExtraction> {
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    const retired = new Set<string>(); // 404: this key can no longer use the model
    const usable = () => this.models.filter((m) => !retired.has(m) && !isExhausted(m));
    let lastError: unknown;

    // Rounds: try every usable model in order; if all are briefly busy
    // (overloaded / per-minute limit), pause and go round again while the time budget allows.
    while (usable().length > 0) {
      for (const model of usable()) {
        const remaining = deadline - Date.now();
        if (remaining < MIN_ATTEMPT_MS) throw this.finalError(lastError, retired);
        try {
          return await this.extractWith(model, input, Math.min(ATTEMPT_TIMEOUT_MS, remaining));
        } catch (error) {
          lastError = error;
          if (!isRetryable(error)) throw this.toExtractionError(error);
          if (error instanceof ApiError && error.status === 404) retired.add(model);
          const wait = error instanceof ApiError && error.status === 429 ? retryDelayMs(error) : null;
          if (wait !== null && wait > LONG_QUOTA_MS) exhaustedUntil.set(model, Date.now() + wait);
          // Content-free log line: which model was skipped and why, no document data.
          console.warn(`[extract] ${model} unavailable (${error instanceof ApiError ? error.status : "timeout"}${wait !== null && wait > LONG_QUOTA_MS ? ", quota used up" : ""}), trying next model`);
        }
      }
      if (usable().length === 0) break;
      const pause = suggestedPauseMs(lastError);
      if (deadline - Date.now() - pause < MIN_ATTEMPT_MS) break;
      console.warn(`[extract] all models busy, retrying in ${Math.round(pause / 1000)}s`);
      await sleep(pause);
    }
    throw this.finalError(lastError, retired);
  }

  /** If every model this key can still use has run out of quota, say so instead of "did not respond". */
  private finalError(lastError: unknown, retired: Set<string>): ExtractionError {
    const stillUsable = this.models.filter((m) => !retired.has(m));
    if (stillUsable.length > 0 && stillUsable.every(isExhausted)) {
      return new ExtractionError("quotaExceeded", "The AI key's usage limit is used up for now.");
    }
    return this.toExtractionError(lastError);
  }

  private toExtractionError(error: unknown): ExtractionError {
    if (error instanceof ExtractionError) return error;
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return new ExtractionError("notConfigured", "The extraction provider rejected the configured key.");
    }
    if (error instanceof ApiError && error.status === 400 && /api key/i.test(error.message)) {
      return new ExtractionError("notConfigured", "The extraction provider rejected the configured key.");
    }
    return new ExtractionError("providerFailed", error instanceof ApiError ? `Provider error ${error.status}` : "Extraction request failed.");
  }

  private async extractWith(model: string, input: ExtractionInput, timeoutMs: number): Promise<RawExtraction> {
    const response = await this.client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: userInstruction(input.document, input.maskedText) }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    if (response.promptFeedback?.blockReason) {
      throw new ExtractionError("refused", "The model declined to read this document.");
    }
    const text = response.text;

    // Never trust the model output blindly: it must match the schema exactly.
    let json: unknown;
    try {
      json = JSON.parse(text ?? "");
    } catch {
      throw new ExtractionError("providerFailed", "Provider returned non-JSON output.");
    }
    const parsed = extractionSchema.safeParse(json);
    if (!parsed.success) throw new ExtractionError("providerFailed", "Provider output did not match the schema.");
    return parsed.data;
  }
}
