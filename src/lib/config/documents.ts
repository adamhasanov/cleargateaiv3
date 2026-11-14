import type { DocumentId, FieldId } from "@/lib/engine/types";

/**
 * Document and field configuration.
 *
 * Every value in this file depends on an OPEN product decision. They are kept
 * in one place so the team can change them without touching the logic.
 */

/**
 * DEC-01 (accepted formats) is UNDECIDED. The formats below are the ones shown
 * in the owner's design reference (PDF, JPG, PNG). Provisional.
 */
export const ACCEPTED_FORMATS = [
  { mime: "application/pdf", extensions: [".pdf"], label: "PDF" },
  { mime: "image/jpeg", extensions: [".jpg", ".jpeg"], label: "JPG" },
  { mime: "image/png", extensions: [".png"], label: "PNG" },
] as const;

export type AcceptedMime = (typeof ACCEPTED_FORMATS)[number]["mime"];

/**
 * File size limit. Not a product decision (ARC-Q-09 is open): it is the
 * technical ceiling of a single serverless request on Vercel (4.5 MB body),
 * kept slightly below it.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

/**
 * DEC-04 (which field is expected in which document) is UNDECIDED.
 * Until it is decided, every field is treated as expected in every document,
 * so a missing value is reported as "not found" — never silently ignored.
 * Set a cell to `false` to mark the field "not applicable" for that document.
 */
export const FIELD_COVERAGE: Record<DocumentId, Record<FieldId, boolean>> = {
  invoice: { weight: true, quantity: true, price: true, hsCode: true },
  packingList: { weight: true, quantity: true, price: true, hsCode: true },
  customsDocument: { weight: true, quantity: true, price: true, hsCode: true },
};

export function detectAcceptedMime(bytes: Uint8Array): AcceptedMime | null {
  // Identify by content, not by the file name the browser reports.
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

/** Client-side pre-check by name/type. The server re-checks the content. */
export function isAcceptedFileName(name: string, type: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_FORMATS.some(
    (f) => f.mime === type || f.extensions.some((ext) => lower.endsWith(ext)),
  );
}
