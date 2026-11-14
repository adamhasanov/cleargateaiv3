import { NextResponse } from "next/server";
import { detectAcceptedMime, MAX_FILE_BYTES } from "@/lib/config/documents";
import { DOCUMENT_IDS, type DocumentId } from "@/lib/engine/types";
import { ExtractionError, getExtractionProvider } from "@/lib/extraction/provider";
import { toDocumentExtraction } from "@/lib/extraction/schema";
import { getCurrentUser } from "@/lib/server/auth";
import { assertCheckAcceptsDocument, recordExtraction } from "@/lib/server/checks";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, HttpError } from "@/lib/server/http";
import { DocumentTextError } from "@/lib/privacy/document-text";
import { PrivacyBlockedError, prepareDocumentForAI } from "@/lib/privacy/prepare";
import type { RawExtraction } from "@/lib/extraction/schema";

const notFound = { found: false, raw: null, number: null, unit: null };
const UNREADABLE: RawExtraction = { readable: false, weight: { ...notFound, basis: "unspecified" }, quantity: notFound, price: notFound, hsCode: { found: false, raw: null } };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST one document; returns the extraction outcome for that document.
 *
 * Privacy (F9a, design plan): the file is read into memory, sent to the
 * configured provider, and dropped when the request ends. Nothing is written
 * to disk or a database, and no document content is logged.
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

/**
 * Requires a signed-in user and a `checkId` reserved with POST /api/checks
 * (which enforces the plan limit). Each document of a check is read once;
 * the extracted values are stored on the check, the file never is.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return fail("forbidden", 403);
  }
  const user = await getCurrentUser();
  if (!user) return fail("unauthenticated", 401);

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
  const checkId = form.get("checkId");
  if (
    typeof document !== "string" || !DOCUMENT_IDS.includes(document as DocumentId) || !(file instanceof File) ||
    typeof checkId !== "string" || !/^[0-9a-f-]{36}$/i.test(checkId)
  ) {
    return fail("badRequest", 400);
  }
  const db = await getDb();
  try {
    await assertCheckAcceptsDocument(db, user.id, checkId, document as DocumentId);
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.status);
    throw error;
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
    await recordExtraction(db, user.id, checkId, extraction);
    return NextResponse.json({ extraction }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.status);
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
