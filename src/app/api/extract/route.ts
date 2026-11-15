import { NextResponse } from "next/server";
import { detectAcceptedMime, MAX_FILE_BYTES } from "@/lib/config/documents";
import { DOCUMENT_IDS, type DocumentId } from "@/lib/engine/types";
import { ExtractionError, getExtractionProvider } from "@/lib/extraction/provider";
import { toDocumentExtraction, type RawExtraction } from "@/lib/extraction/schema";
import { DocumentTextError } from "@/lib/privacy/document-text";
import { PrivacyBlockedError, prepareDocumentForAI } from "@/lib/privacy/prepare";
import { assertSameOrigin, clientIp } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";

const notFound = { found: false, raw: null, number: null, unit: null };
const UNREADABLE: RawExtraction = { readable: false, weight: { ...notFound, basis: "unspecified" }, quantity: notFound, price: notFound, hsCode: { found: false, raw: null } };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST one document; returns the extraction outcome for that document.
 *
 * MVP demo: there are no accounts and no database. The file is read into
 * memory, its text is extracted and masked, only the masked text goes to the
 * AI provider, and everything is dropped when the request ends. Nothing is
 * stored, and no document content is logged.
 */

type ErrorCode = "badRequest" | "unsupportedFormat" | "tooLarge" | "notConfigured" | "providerFailed" | "refused" | "quotaExceeded";

const STATUS_FOR: Partial<Record<ErrorCode, number>> = { notConfigured: 503, quotaExceeded: 429 };

const fail = (code: ErrorCode | string, status: number) =>
  NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });

/** GET tells the interface whether extraction is configured, without revealing anything else. */
export async function GET() {
  const provider = await getExtractionProvider();
  return NextResponse.json({ configured: provider !== null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return fail("forbidden", 403);
  }
  // No accounts to meter, so cap how much one client can send (about 13 checks of 3 documents per 15 minutes).
  if (!rateLimit(`extract|${clientIp(request)}`, 40, 15 * 60_000)) return fail("tooManyRequests", 429);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_FILE_BYTES + 64 * 1024) return fail("tooLarge", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("badRequest", 400);
  }

  const document = form.get("document");
  const file = form.get("file");
  if (typeof document !== "string" || !DOCUMENT_IDS.includes(document as DocumentId) || !(file instanceof File)) {
    return fail("badRequest", 400);
  }
  if (file.size === 0) return fail("badRequest", 400);
  if (file.size > MAX_FILE_BYTES) return fail("tooLarge", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectAcceptedMime(bytes);
  if (!mime) return fail("unsupportedFormat", 415);

  const provider = await getExtractionProvider();
  if (!provider) return fail("notConfigured", 503);

  try {
    // F9b: text is extracted and masked HERE, on the server. Only the masked text goes to the provider;
    // if masking cannot be completed, nothing is sent (no unmasked fallback).
    const prepared = await prepareDocumentForAI(bytes, mime);
    const extraction = prepared.empty
      ? toDocumentExtraction(document as DocumentId, UNREADABLE) // nothing legible: no AI call at all
      : toDocumentExtraction(document as DocumentId, await provider.extract({ document: document as DocumentId, maskedText: prepared.text }));
    return NextResponse.json({ extraction }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DocumentTextError) return fail(error.code, 422);
    if (error instanceof PrivacyBlockedError) {
      console.error("[extract] maskingIncomplete — request blocked, nothing sent");
      return fail("maskingIncomplete", 422);
    }
    if (error instanceof ExtractionError) {
      // Content-free log line: error code only, no document data.
      console.error(`[extract] ${error.code}`);
      return fail(error.code, STATUS_FOR[error.code] ?? 502);
    }
    console.error("[extract] unexpected failure");
    return fail("providerFailed", 502);
  }
}
