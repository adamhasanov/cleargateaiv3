import "server-only";
import type { AcceptedMime } from "@/lib/config/documents";
import { extractDocumentText, type DocumentText } from "./document-text";
import { maskSensitiveText, residualSensitive, type MaskResult } from "./mask";

export class PrivacyBlockedError extends Error {
  constructor() {
    super("maskingIncomplete");
  }
}

export interface PreparedDocument {
  /** Masked text — the only document content that may be sent to an AI provider. */
  text: string;
  source: DocumentText["source"];
  counts: MaskResult["counts"];
  /** OCR/text layer produced too little text to read anything. */
  empty: boolean;
}

/**
 * The single gate between an uploaded document and any AI provider:
 * extract text locally → mask → verify nothing sensitive is left (fail closed).
 * The original bytes and the unmasked text stay inside this function.
 */
export async function prepareDocumentForAI(bytes: Uint8Array, mime: AcceptedMime): Promise<PreparedDocument> {
  const extracted = await extractDocumentText(bytes, mime);
  const masked = maskSensitiveText(extracted.text);
  if (residualSensitive(masked.text).length > 0) throw new PrivacyBlockedError();
  return {
    text: masked.text,
    source: extracted.source,
    counts: masked.counts,
    empty: masked.text.replace(/\s|\[[A-Z_]+\]/g, "").length < 20,
  };
}
