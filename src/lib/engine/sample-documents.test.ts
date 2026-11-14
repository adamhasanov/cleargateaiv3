import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectAcceptedMime, MAX_FILE_BYTES } from "@/lib/config/documents";
import sampleData from "../../../samples/sample-sets.json";
import { runCheck } from "./compare";
import type { DocumentExtraction, DocumentId, FieldId, FieldOutcome } from "./types";

/**
 * The four "Try sample documents" scenarios (public/samples/<id>/) are generated
 * from samples/sample-sets.json. This test feeds the values printed on those
 * PDFs — what a correct reading returns, "not found" where a value is not
 * printed — through the rule engine and checks each scenario shows what it is
 * meant to show. (The live app reads the PDFs with the AI; nothing here is shown to users.)
 */

type SampleDoc = { number: string; cartons: number; grossKg: number; netKg: number; total: number | null; hsCode: string | null };
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf: FieldOutcome = { status: "notFound" };

function asPrinted(document: DocumentId, d: SampleDoc): DocumentExtraction {
  return {
    document,
    readable: true,
    fields: {
      weight: { status: "value", value: { raw: `${fmt(d.grossKg)} kg`, number: d.grossKg, unit: "kg", basis: "gross" } },
      quantity: { status: "value", value: { raw: `${d.cartons} cartons`, number: d.cartons, unit: "cartons" } },
      price: d.total === null ? nf : { status: "value", value: { raw: `${fmt(d.total)} USD`, number: d.total, unit: "USD" } },
      hsCode: d.hsCode === null ? nf : { status: "value", value: { raw: d.hsCode, code: d.hsCode } },
    },
  };
}

const FILES: Record<DocumentId, string> = {
  invoice: "1-invoice.pdf",
  packingList: "2-packing-list.pdf",
  customsDocument: "3-customs-declaration.pdf",
};

it("offers exactly the four scenarios shown on the upload page", () => {
  expect(sampleData.sets.map((s) => s.id)).toEqual(["clean", "quantity-weight", "hs-code", "missing-info"]);
});

describe.each(sampleData.sets)("sample scenario $id", (set) => {
  const docs = set.documents as Record<DocumentId, SampleDoc>;
  const result = runCheck([asPrinted("invoice", docs.invoice), asPrinted("packingList", docs.packingList), asPrinted("customsDocument", docs.customsDocument)]);

  it(`gives result class ${set.expected.resultClass}`, () => {
    expect(result.resultClass).toBe(set.expected.resultClass);
  });

  it.each(["weight", "quantity", "price", "hsCode"] as FieldId[])("reports the designed status for %s", (field) => {
    expect(result.comparisons.find((c) => c.field === field)!.status).toBe(set.expected[field]);
  });

  it.each(Object.entries(FILES))("ships %s as a PDF the upload route accepts", (_doc, file) => {
    // Regenerate with `npm run samples` if this fails.
    const bytes = new Uint8Array(readFileSync(`public/samples/${set.id}/${file}`));
    expect(detectAcceptedMime(bytes)).toBe("application/pdf");
    expect(bytes.length).toBeLessThan(MAX_FILE_BYTES);
  });
});

it("the quantity & weight scenario carries the approved illustrative example (1,250 kg vs 1,200 kg)", () => {
  const q = sampleData.sets.find((s) => s.id === "quantity-weight")!;
  expect(q.documents.invoice.grossKg).toBe(1250);
  expect(q.documents.packingList.grossKg).toBe(1200);
});
