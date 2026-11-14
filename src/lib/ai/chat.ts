import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * Text chat for the AI Customs Advisor, behind one small interface.
 * Provider: CLEARGATE_ADVISOR_PROVIDER (gemini | anthropic), default = the
 * extraction provider. Keys stay on the server (GEMINI_API_KEY / ANTHROPIC_API_KEY).
 */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type ChatResult = { ok: true; text: string } | { ok: false; error: "notConfigured" | "quotaExceeded" | "providerFailed" };

const LONG_QUOTA_MS = 60_000;
const exhaustedUntil = new Map<string, number>();

function provider(): "gemini" | "anthropic" {
  const p = (process.env.CLEARGATE_ADVISOR_PROVIDER || process.env.CLEARGATE_EXTRACTION_PROVIDER || "gemini").trim().toLowerCase();
  return p === "anthropic" ? "anthropic" : "gemini";
}

export function advisorConfigured(): boolean {
  return provider() === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY?.trim()) : Boolean(process.env.GEMINI_API_KEY?.trim());
}

function geminiModels(): string[] {
  const configured = process.env.CLEARGATE_ADVISOR_MODEL?.trim();
  // Flash-Lite models have their own free-tier quotas, so they keep the advisor available longer.
  return [...new Set([configured, "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"].filter(Boolean) as string[])];
}

async function geminiReply(system: string, turns: ChatTurn[]): Promise<ChatResult> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const deadline = Date.now() + 45_000;
  let sawQuota = false;
  for (const model of geminiModels()) {
    if ((exhaustedUntil.get(model) ?? 0) > Date.now()) {
      sawQuota = true;
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining < 5_000) break;
    try {
      const res = await client.models.generateContent({
        model,
        contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
        config: { systemInstruction: system, temperature: 0.2, maxOutputTokens: 1400, abortSignal: AbortSignal.timeout(Math.min(25_000, remaining)) },
      });
      const text = res.text?.trim();
      if (text) return { ok: true, text };
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 403) return { ok: false, error: "notConfigured" };
        if (error.status === 429) {
          sawQuota = true;
          const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(error.message);
          const wait = m ? parseFloat(m[1]) * 1000 : 0;
          if (wait > LONG_QUOTA_MS) exhaustedUntil.set(model, Date.now() + wait);
        }
      }
      console.warn(`[advisor] ${model} unavailable (${error instanceof ApiError ? error.status : "timeout"})`);
    }
  }
  const allExhausted = geminiModels().every((m) => (exhaustedUntil.get(m) ?? 0) > Date.now());
  return { ok: false, error: allExhausted || sawQuota ? "quotaExceeded" : "providerFailed" };
}

async function anthropicReply(system: string, turns: ChatTurn[]): Promise<ChatResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  try {
    const res = await client.messages.create({
      model: process.env.CLEARGATE_ADVISOR_MODEL?.trim() || "claude-sonnet-5-5",
      max_tokens: 1400,
      system,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text ? { ok: true, text } : { ok: false, error: "providerFailed" };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "notConfigured" };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "quotaExceeded" };
    return { ok: false, error: "providerFailed" };
  }
}

export async function chatReply(system: string, turns: ChatTurn[]): Promise<ChatResult> {
  if (!advisorConfigured()) return { ok: false, error: "notConfigured" };
  return provider() === "anthropic" ? anthropicReply(system, turns) : geminiReply(system, turns);
}
