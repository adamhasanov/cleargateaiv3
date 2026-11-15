import type { DocumentExtraction, DocumentId } from "@/lib/engine/types";

export type ApiErrorCode =
  | "badRequest" | "unsupportedFormat" | "tooLarge" | "notConfigured" | "providerFailed" | "refused" | "quotaExceeded" | "network"
  | "unauthenticated" | "checkClosed" | "checkNotFound" | "documentAlreadyRead" | "scannedPdf" | "pdfUnreadable" | "maskingIncomplete" | "ocrFailed";

export type ExtractResponse = { ok: true; extraction: DocumentExtraction } | { ok: false; error: ApiErrorCode };

const KNOWN: ApiErrorCode[] = [
  "badRequest", "unsupportedFormat", "tooLarge", "notConfigured", "providerFailed", "refused", "quotaExceeded",
  "unauthenticated", "checkClosed", "checkNotFound", "documentAlreadyRead", "scannedPdf", "pdfUnreadable", "maskingIncomplete", "ocrFailed",
];

export async function extractDocument(checkId: string, document: DocumentId, file: File, signal: AbortSignal): Promise<ExtractResponse> {
  const body = new FormData();
  body.set("checkId", checkId);
  body.set("document", document);
  body.set("file", file);
  try {
    const res = await fetch("/api/extract", { method: "POST", body, signal });
    const json = (await res.json().catch(() => null)) as { extraction?: DocumentExtraction; error?: string } | null;
    if (res.ok && json?.extraction && json.extraction.document === document) {
      return { ok: true, extraction: json.extraction };
    }
    const code = KNOWN.find((k) => k === json?.error) ?? (res.status === 413 ? "tooLarge" : "providerFailed");
    return { ok: false, error: code };
  } catch (error) {
    if (signal.aborted) throw error;
    return { ok: false, error: "network" };
  }
}

export async function fetchExtractionConfigured(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/extract", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { configured?: boolean };
    return typeof json.configured === "boolean" ? json.configured : null;
  } catch {
    return null;
  }
}
