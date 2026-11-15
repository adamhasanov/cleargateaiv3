import "server-only";
import { mkdirSync } from "node:fs";
import type { AcceptedMime } from "@/lib/config/documents";

/**
 * Local text extraction — the document itself never leaves the server.
 *  - PDF with a text layer: pdf.js reads the text; lines and columns are rebuilt from positions.
 *  - JPG / PNG (scans, photos): Tesseract OCR runs locally (az + ru + en).
 *  - PDF without a text layer (a scan saved as PDF): refused — it cannot be masked without
 *    rendering pages, and an unmasked document is never sent as a fallback.
 */

export class DocumentTextError extends Error {
  constructor(public readonly code: "scannedPdf" | "pdfUnreadable" | "ocrFailed") {
    super(code);
  }
}

/** OCR must finish well inside the platform's function limit so a failure is a clean error, not a timeout. */
const OCR_TIMEOUT_MS = 40_000;

export interface DocumentText {
  text: string;
  source: "pdf-text" | "ocr";
}

/** Fewer visible characters than this per page means "no usable text layer". */
const MIN_CHARS_PER_PAGE = 40;

type TextItem = { str: string; x: number; y: number; w: number; h: number };

/** Groups positioned text into lines (top to bottom) and joins columns with two spaces. */
export function layoutLines(items: TextItem[]): string[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - it.y) <= Math.max(2, it.h * 0.35)) line.push(it);
    else lines.push([it]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let out = "";
    let end = -Infinity;
    for (const it of line) {
      const gap = it.x - end;
      if (out) out += gap > Math.max(it.h, 6) * 1.2 ? "  " : gap > it.h * 0.12 ? " " : "";
      out += it.str;
      end = it.x + it.w;
    }
    return out.trimEnd();
  });
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    await task.destroy().catch(() => {});
    throw new DocumentTextError("pdfUnreadable");
  }
  try {
    const pages: string[] = [];
    let visible = 0;
    for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = (content.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
        .filter((i) => typeof i.str === "string" && i.transform)
        .map((i) => ({ str: i.str!, x: i.transform![4], y: i.transform![5], w: i.width ?? 0, h: i.height || Math.abs(i.transform![3]) || 10 }));
      const lines = layoutLines(items);
      visible += lines.join("").replace(/\s/g, "").length;
      pages.push(lines.join("\n"));
    }
    if (visible < MIN_CHARS_PER_PAGE * Math.min(doc.numPages, 20)) throw new DocumentTextError("scannedPdf");
    return pages.join("\n\n--- page break ---\n\n");
  } finally {
    await task.destroy().catch(() => {});
  }
}

// One OCR worker per server process (language data is loaded once).
type OcrWorker = { recognize: (image: Buffer) => Promise<{ data: { text: string } }> };
const globalForOcr = globalThis as unknown as { __cgOcr?: Promise<OcrWorker> };

function ocrWorker(): Promise<OcrWorker> {
  if (!globalForOcr.__cgOcr) {
    globalForOcr.__cgOcr = (async () => {
      const { createWorker } = await import("tesseract.js");
      // Serverless hosts (Vercel) only allow writes under /tmp.
      const cachePath = process.env.TESSDATA_CACHE_DIR?.trim() || (process.env.VERCEL ? "/tmp/tessdata" : ".data/tessdata");
      mkdirSync(cachePath, { recursive: true });
      // Language data (not document content) is fetched once from the tessdata CDN, or from TESSDATA_LANG_PATH.
      return (await createWorker(["aze", "rus", "eng"], 1, {
        cachePath,
        ...(process.env.TESSDATA_LANG_PATH?.trim() ? { langPath: process.env.TESSDATA_LANG_PATH.trim() } : {}),
        logger: () => {},
        errorHandler: () => {},
      })) as unknown as OcrWorker;
    })().catch((e) => {
      globalForOcr.__cgOcr = undefined;
      throw e;
    });
  }
  return globalForOcr.__cgOcr;
}

async function imageText(bytes: Uint8Array): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const worker = await ocrWorker();
        const { data } = await worker.recognize(Buffer.from(bytes));
        return data.text;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("ocr timeout")), OCR_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // A crashed or stuck worker must not be reused; the next request starts a fresh one.
    globalForOcr.__cgOcr = undefined;
    console.error("[ocr] failed or timed out"); // content-free
    throw new DocumentTextError("ocrFailed");
  } finally {
    clearTimeout(timer);
  }
}

export async function extractDocumentText(bytes: Uint8Array, mime: AcceptedMime): Promise<DocumentText> {
  if (mime === "application/pdf") return { text: await pdfText(bytes), source: "pdf-text" };
  return { text: await imageText(bytes), source: "ocr" };
}
