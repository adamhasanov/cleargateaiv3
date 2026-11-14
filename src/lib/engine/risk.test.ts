import { describe, expect, it } from "vitest";
import sampleData from "../../../samples/sample-sets.json";
import { runCheck } from "./compare";
import { computeRiskScore, levelFor } from "./risk";
import type { DocumentExtraction, DocumentId, ExtractedValue, FieldOutcome } from "./types";

const v = (value: ExtractedValue): FieldOutcome => ({ status: "value", value });
const nf: FieldOutcome = { status: "notFound" };
const kg = (n: number, basis: "gross" | "net" = "gross") => v({ raw: `${n} kg`, number: n, unit: "kg", basis });
const ctn = (n: number) => v({ raw: `${n} cartons`, number: n, unit: "cartons" });
const usd = (n: number) => v({ raw: `${n} USD`, number: n, unit: "USD" });
const hs = (code: string) => v({ raw: code, code });

function doc(document: DocumentId, fields: Partial<DocumentExtraction["fields"]>, readable = true): DocumentExtraction {
  return { document, readable, fields: { weight: nf, quantity: nf, price: nf, hsCode: nf, ...fields } };
}
const all = (w: number, q: number, p: number, h: string) => ({ weight: kg(w), quantity: ctn(q), price: usd(p), hsCode: hs(h) });

describe("shipment risk score", () => {
  it("is 0 / low when all four fields agree in all three documents", () => {
    const r = computeRiskScore(runCheck([doc("invoice", all(1250, 40, 18500, "0000.00")), doc("packingList", all(1250, 40, 18500, "0000.00")), doc("customsDocument", all(1250, 40, 18500, "0000.00"))]));
    expect(r).toMatchObject({ score: 0, level: "low", reasons: [], version: "risk-1" });
  });

  it("scores weight 4 %, quantity 5 % and an HS code mismatch together as 80 / high with every reason listed", () => {
    const r = computeRiskScore(runCheck([
      doc("invoice", all(1250, 40, 18500, "0000.00")),
      doc("packingList", all(1200, 38, 18500, "0000.00")),
      doc("customsDocument", all(1250, 40, 18500, "0000.10")),
    ]));
    expect(r.score).toBe(80);
    expect(r.level).toBe("high");
    expect(r.reasons).toEqual([
      expect.objectContaining({ code: "mismatch", field: "hsCode", points: 30, severity: "major" }),
      expect.objectContaining({ code: "mismatch", field: "weight", points: 25, severity: "moderate" }),
      expect.objectContaining({ code: "mismatch", field: "quantity", points: 25, severity: "moderate" }),
    ]);
  });

  it("grades numeric severity by relative spread", () => {
    const score = (a: number, b: number) =>
      computeRiskScore(runCheck([doc("invoice", { weight: kg(a) }), doc("packingList", { weight: kg(b) }), doc("customsDocument", { weight: kg(a) })]))
        .reasons.find((x) => x.code === "mismatch")!;
    expect(score(1000, 999)).toMatchObject({ severity: "minor", points: 20 }); // 0.1 %
    expect(score(1000, 970)).toMatchObject({ severity: "moderate", points: 25 }); // 3 %
    expect(score(1000, 800)).toMatchObject({ severity: "major", points: 30 }); // 20 %
  });

  it("scores each sample scenario as designed (clean 0, quantity & weight 50, HS code 30, missing information 10)", () => {
    const fromSample = (id: DocumentId, d: { cartons: number; grossKg: number; total: number | null; hsCode: string | null }) =>
      doc(id, {
        weight: kg(d.grossKg), quantity: ctn(d.cartons),
        ...(d.total === null ? {} : { price: usd(d.total) }), ...(d.hsCode === null ? {} : { hsCode: hs(d.hsCode) }),
      });
    const scores = Object.fromEntries(sampleData.sets.map((s) => [s.id, computeRiskScore(runCheck([
      fromSample("invoice", s.documents.invoice), fromSample("packingList", s.documents.packingList), fromSample("customsDocument", s.documents.customsDocument),
    ])).score]));
    expect(scores).toEqual({ clean: 0, "quantity-weight": 50, "hs-code": 30, "missing-info": 10 });
  });

  it("never treats missing information as a match: a missing value adds points", () => {
    const r = computeRiskScore(runCheck([
      doc("invoice", all(1250, 40, 18500, "0000.00")),
      doc("packingList", { weight: kg(1250), quantity: ctn(40), hsCode: hs("0000.00") }), // no price
      doc("customsDocument", all(1250, 40, 18500, "0000.00")),
    ]));
    expect(r.score).toBe(5);
    expect(r.reasons).toEqual([{ code: "missingValue", field: "price", points: 5, documents: ["packingList"] }]);
  });

  it("scores an unreadable document and fields that can no longer be compared", () => {
    const r = computeRiskScore(runCheck([
      doc("invoice", all(1250, 40, 18500, "0000.00")),
      doc("packingList", {}, false),
      doc("customsDocument", { weight: kg(1250), quantity: ctn(40), hsCode: hs("0000.00") }),
    ]));
    // unreadable packing list 15; price only in the invoice → not comparable 10; nothing else missing
    expect(r.reasons).toEqual(expect.arrayContaining([
      { code: "unreadableDocument", document: "packingList", points: 15 },
      { code: "notComparable", field: "price", points: 10 },
    ]));
    expect(r.score).toBe(25);
    expect(r.level).toBe("medium");
  });

  it("flags uncertain values (different units, gross vs net) instead of calling them a match", () => {
    const r = computeRiskScore(runCheck([
      doc("invoice", { weight: kg(1250, "gross"), quantity: ctn(40) }),
      doc("packingList", { weight: kg(1150, "net"), quantity: v({ raw: "480 pcs", number: 480, unit: "pcs" }) }),
      doc("customsDocument", { weight: kg(1250, "gross"), quantity: ctn(40) }),
    ]));
    expect(r.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "uncertainValues", field: "weight", reason: "basisDiffers", points: 8 }),
      expect.objectContaining({ code: "uncertainValues", field: "quantity", reason: "unitDiffers", points: 8 }),
    ]));
  });

  it("caps at 100 and is deterministic", () => {
    const input = [
      doc("invoice", all(100, 1, 10, "1111")),
      doc("packingList", all(900, 9, 90, "2222")),
      doc("customsDocument", {}, false),
    ];
    const a = computeRiskScore(runCheck(input));
    const b = computeRiskScore(runCheck(input));
    expect(a.score).toBe(100);
    expect(a.level).toBe("high");
    expect(a).toEqual(b);
  });

  it("maps scores to levels at the documented thresholds", () => {
    expect([0, 24, 25, 59, 60, 100].map(levelFor)).toEqual(["low", "low", "medium", "medium", "high", "high"]);
  });
});
