import "server-only";
import type { DocumentId } from "@/lib/engine/types";
import type { RawExtraction } from "./schema";

/**
 * What an AI provider receives: the document's MASKED text only (F9b).
 * There is deliberately no field for the file or unmasked text — build it with
 * prepareDocumentForAI() (src/lib/privacy/prepare.ts).
 */
export interface ExtractionInput {
  document: DocumentId;
  maskedText: string;
}

/** quotaExceeded: the AI key's usage limit (e.g. the free tier's daily cap) is used up for now. */
export type ExtractionErrorCode = "notConfigured" | "providerFailed" | "refused" | "quotaExceeded";

export class ExtractionError extends Error {
  constructor(public readonly code: ExtractionErrorCode, message: string) {
    super(message);
  }
}

/** Any extraction method (DEC-03 is open) plugs in behind this interface. */
export interface ExtractionProvider {
  readonly name: string;
  extract(input: ExtractionInput): Promise<RawExtraction>;
}

/**
 * DEC-03: the provider is chosen by configuration. Default: Google Gemini
 * (free AI Studio key). Returns null when the chosen provider has no key, so
 * the interface can say "not configured" instead of simulating anything.
 */
export async function getExtractionProvider(): Promise<ExtractionProvider | null> {
  const provider = (process.env.CLEARGATE_EXTRACTION_PROVIDER || "gemini").trim().toLowerCase();
  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) return null;
    const { GeminiExtractionProvider } = await import("./gemini");
    return new GeminiExtractionProvider();
  }
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const { AnthropicExtractionProvider } = await import("./anthropic");
    return new AnthropicExtractionProvider();
  }
  return null;
}
