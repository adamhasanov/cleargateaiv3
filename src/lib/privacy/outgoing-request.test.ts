import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sampleData from "../../../samples/sample-sets.json";
import { prepareDocumentForAI } from "./prepare";

/**
 * Inspects what would actually leave the server for the AI provider.
 * The real Gemini provider runs; only the network is replaced by a recorder,
 * so every request body is captured and checked instead of being sent.
 */
const captured: { url: string; body: string }[] = [];
const realFetch = globalThis.fetch;
const VALID_REPLY = JSON.stringify({
  readable: true,
  weight: { found: true, raw: "1,250.00 kg", number: 1250, unit: "kg", basis: "gross" },
  quantity: { found: true, raw: "40 cartons", number: 40, unit: "cartons" },
  price: { found: false, raw: null, number: null, unit: null },
  hsCode: { found: false, raw: null },
});

beforeAll(() => {
  process.env.GEMINI_API_KEY = "test-key-not-real";
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.clone().text() : String(init?.body ?? "");
    captured.push({ url, body });
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: VALID_REPLY }] }, finishReason: "STOP" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const { seller, buyer, declarant } = sampleData.shared;
const SENSITIVE = [
  seller.name, buyer.name, declarant.name, "Sample Commercial Bank", seller.address[0], buyer.address[0],
  seller.email, buyer.email, seller.phone, buyer.phone, "Aysel Mammadova", "Rashad Aliyev", "SAMPAZ22", "AZ77SAMP",
  "1402345671", "1708912345", "1300456782",
];
const FILES = { invoice: "1-invoice.pdf", packingList: "2-packing-list.pdf", customsDocument: "3-customs-declaration.pdf" } as const;

describe("outgoing AI requests (Gemini provider, network recorded)", () => {
  for (const set of sampleData.sets) {
    for (const [doc, file] of Object.entries(FILES) as [keyof typeof FILES, string][]) {
      it(`${set.id}/${file}: the request carries masked text only`, async () => {
        const { GeminiExtractionProvider } = await import("@/lib/extraction/gemini");
        const prepared = await prepareDocumentForAI(new Uint8Array(readFileSync(`public/samples/${set.id}/${file}`)), "application/pdf");
        captured.length = 0;
        const result = await new GeminiExtractionProvider().extract({ document: doc, maskedText: prepared.text });
        expect(result.readable).toBe(true);

        expect(captured.length).toBeGreaterThan(0);
        for (const { url, body } of captured) {
          expect(url).toMatch(/generativelanguage\.googleapis\.com/);
          // No file attached in any form.
          expect(body).not.toContain("inlineData");
          expect(body).not.toContain("JVBER"); // base64 of "%PDF"
          expect(body).not.toContain("%PDF");
          // No identifying value, as text or as digits.
          for (const value of SENSITIVE) expect(body, `"${value}" left the server`).not.toContain(value);
          // The business data the reader needs is there, and the placeholders show what was removed.
          const d = set.documents[doc];
          expect(body).toContain(d.grossKg.toLocaleString("en-US", { minimumFractionDigits: 2 }));
          expect(body).toMatch(/\[(COMPANY|PARTY)\]/);
        }
      });
    }
  }
});
