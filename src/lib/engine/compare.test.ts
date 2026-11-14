import { describe, expect, it } from "vitest";
import { canonicalHsCode, runCheck } from "./compare";
import type { DocumentExtraction, DocumentId, ExtractedValue, FieldOutcome } from "./types";

const v = (value: ExtractedValue): FieldOutcome => ({ status: "value", value });
const nf: FieldOutcome = { status: "notFound" };

function doc(document: DocumentId, fields: Partial<DocumentExtraction["fields"]>, readable = true): DocumentExtraction {
  return {
    document,
    readable,
    fields: { weight: nf, quantity: nf, price: nf, hsCode: nf, ...fields },
  };
}

// SAMPLE values only. 1,250 kg vs 1,200 kg is the approved illustrative example.
const agreeing = (): DocumentExtraction[] => [
  doc("invoice", {
    weight: v({ raw: "1,200 kg", number: 1200, unit: "kg", basis: "gross" }),
    quantity: v({ raw: "40 pcs", number: 40, unit: "pcs" }),
    price: v({ raw: "18,000 USD", number: 18000, unit: "USD" }),
    hsCode: v({ raw: "8471.30", code: "8471.30" }),
  }),
  doc("packingList", {
    weight: v({ raw: "1200 KG", number: 1200, unit: "KG", basis: "gross" }),
    quantity: v({ raw: "40 pieces", number: 40, unit: "pieces" }),
    price: v({ raw: "USD 18000", number: 18000, unit: "usd" }),
    hsCode: v({ raw: "847130", code: "847130" }),
  }),
  doc("customsDocument", {
    weight: v({ raw: "1200 kg", number: 1200, unit: "kg", basis: "gross" }),
    quantity: v({ raw: "40 pcs", number: 40, unit: "pcs" }),
    price: v({ raw: "18000 USD", number: 18000, unit: "USD" }),
    hsCode: v({ raw: "8471 30", code: "8471 30" }),
  }),
];

const byField = (r: ReturnType<typeof runCheck>, f: string) => r.comparisons.find((c) => c.field === f)!;

describe("rule engine", () => {
  it("reports no mismatch when all comparable fields clearly agree", () => {
    const r = runCheck(agreeing());
    expect(r.resultClass).toBe("noMismatch");
    expect(r.comparisons.every((c) => c.status === "match")).toBe(true);
  });

  it("reports the SAMPLE weight mismatch with documents, values and difference", () => {
    const docs = agreeing();
    docs[0].fields.weight = v({ raw: "1,250 kg", number: 1250, unit: "kg", basis: "gross" });
    const r = runCheck(docs);
    const w = byField(r, "weight");
    expect(w.status).toBe("mismatch");
    expect(w.difference).toBe(50);
    expect(w.comparedDocuments).toEqual(["invoice", "packingList", "customsDocument"]);
    expect(w.ruleId).toMatch(/^RS-01/);
    expect(r.resultClass).toBe("mismatchesFound");
  });

  it("detects quantity, price and HS code differences", () => {
    const docs = agreeing();
    docs[1].fields.quantity = v({ raw: "38 pcs", number: 38, unit: "pcs" });
    docs[2].fields.price = v({ raw: "18,500 USD", number: 18500, unit: "USD" });
    docs[2].fields.hsCode = v({ raw: "8471.41", code: "8471.41" });
    const r = runCheck(docs);
    expect(byField(r, "quantity").status).toBe("mismatch");
    expect(byField(r, "price").status).toBe("mismatch");
    expect(byField(r, "hsCode").status).toBe("mismatch");
  });

  it("is deterministic for identical extracted input", () => {
    const docs = agreeing();
    docs[0].fields.weight = v({ raw: "1,250 kg", number: 1250, unit: "kg", basis: "gross" });
    expect(runCheck(docs)).toEqual(runCheck(structuredClone(docs)));
  });

  it("never treats a missing value as a match", () => {
    const docs = agreeing();
    docs[1].fields.price = nf;
    docs[2].fields.price = nf;
    const r = runCheck(docs);
    const p = byField(r, "price");
    expect(p.status).toBe("notCompared");
    expect(p.missingDocuments).toEqual(["packingList", "customsDocument"]);
    expect(r.resultClass).toBe("incomplete");
  });

  it("compares the remaining two documents when one value is missing, but stays incomplete", () => {
    const docs = agreeing();
    docs[2].fields.weight = nf;
    const r = runCheck(docs);
    const w = byField(r, "weight");
    expect(w.status).toBe("match");
    expect(w.missingDocuments).toEqual(["customsDocument"]);
    expect(r.resultClass).toBe("incomplete");
  });

  it("does not convert units: different units are not compared", () => {
    const docs = agreeing();
    docs[1].fields.weight = v({ raw: "1.2 t", number: 1.2, unit: "t", basis: "gross" });
    const w = byField(runCheck(docs), "weight");
    expect(w.status).toBe("notCompared");
    expect(w.notComparedReason).toBe("unitDiffers");
  });

  it("does not compare gross against net weight", () => {
    const docs = agreeing();
    docs[1].fields.weight = v({ raw: "1,200 kg net", number: 1200, unit: "kg", basis: "net" });
    expect(byField(runCheck(docs), "weight").notComparedReason).toBe("basisDiffers");
  });

  it("applies no tolerance: a small difference is still a mismatch", () => {
    const docs = agreeing();
    docs[0].fields.weight = v({ raw: "1,200.5 kg", number: 1200.5, unit: "kg", basis: "gross" });
    expect(byField(runCheck(docs), "weight").status).toBe("mismatch");
  });

  it("marks an unreadable document and never returns a clean result", () => {
    const docs = agreeing();
    docs[2] = doc("customsDocument", {}, false);
    const r = runCheck(docs);
    expect(r.unreadableDocuments).toEqual(["customsDocument"]);
    expect(r.resultClass).toBe("incomplete");
    expect(byField(r, "weight").missingDocuments).toContain("customsDocument");
  });

  it("shows mismatches and incompleteness together", () => {
    const docs = agreeing();
    docs[0].fields.weight = v({ raw: "1,250 kg", number: 1250, unit: "kg", basis: "gross" });
    docs[2] = doc("customsDocument", {}, false);
    expect(runCheck(docs).resultClass).toBe("mismatchesFoundIncomplete");
  });

  it("canonicalises HS code formatting but rejects non-digit codes", () => {
    expect(canonicalHsCode("8471.30.00")).toBe("84713000");
    expect(canonicalHsCode("84-71 30")).toBe("847130");
    expect(canonicalHsCode("ABC")).toBeNull();
  });
});
