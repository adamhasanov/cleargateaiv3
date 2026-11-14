import type { CheckResult, DocumentId, FieldComparison, FieldId } from "./types";

/**
 * Shipment Risk Score (F5) — deterministic, rule-based, no AI.
 *
 * Meaning: 0–100, HIGHER = MORE document problems found before submission
 * (mismatches between the documents, and information that could not be
 * verified). It is an indicator of how much in this document set needs
 * attention. It is NOT an official customs risk assessment and does not
 * predict a customs decision.
 *
 * Rules (version RISK_VERSION). Points add up and are capped at 100:
 *  R1  Mismatch in a field: HS code 30, weight 20, quantity 20, price 20.
 *  R2  Mismatch severity (numeric fields): relative spread (max − min) / max
 *      ≥ 10 % → +10 ("major"), ≥ 2 % → +5 ("moderate"), otherwise +0 ("minor").
 *      HS codes have no magnitude; every HS mismatch counts as major (included in its 30).
 *  R3  A document could not be read at all: +15 per document.
 *  R4  A field could not be compared because fewer than two documents carry it: +10.
 *  R5  A field could not be compared because values are uncertain
 *      (different units, gross vs net, or an unreadable number/code): +8.
 *  R6  A field was compared but is missing in some (readable) document: +5 per document.
 * Levels: 0–24 Low, 25–59 Medium, 60–100 High.
 *
 * Missing information never counts as a match: it always adds points (R3–R6).
 */
export const RISK_VERSION = "risk-1";

export type RiskLevel = "low" | "medium" | "high";
export type Severity = "minor" | "moderate" | "major";

export type RiskReason =
  | { code: "mismatch"; field: FieldId; points: number; severity: Severity; documents: DocumentId[] }
  | { code: "unreadableDocument"; document: DocumentId; points: number }
  | { code: "notComparable"; field: FieldId; points: number }
  | { code: "uncertainValues"; field: FieldId; points: number; reason: "unitDiffers" | "basisDiffers" | "unparsable" }
  | { code: "missingValue"; field: FieldId; points: number; documents: DocumentId[] };

export interface RiskScore {
  version: string;
  score: number;
  level: RiskLevel;
  /** Each rule that added points, largest first. Sum of points ≥ score (score is capped). */
  reasons: RiskReason[];
}

export const MISMATCH_POINTS: Record<FieldId, number> = { hsCode: 30, weight: 20, quantity: 20, price: 20 };
export const SEVERITY_BONUS: Record<Severity, number> = { minor: 0, moderate: 5, major: 10 };
export const UNREADABLE_DOCUMENT_POINTS = 15;
export const NOT_COMPARABLE_POINTS = 10;
export const UNCERTAIN_POINTS = 8;
export const MISSING_VALUE_POINTS = 5;
export const LEVEL_THRESHOLDS = { medium: 25, high: 60 } as const;

export function levelFor(score: number): RiskLevel {
  if (score >= LEVEL_THRESHOLDS.high) return "high";
  if (score >= LEVEL_THRESHOLDS.medium) return "medium";
  return "low";
}

/** Severity of a numeric mismatch from the spread of the compared values. */
export function severityOf(c: FieldComparison): Severity {
  if (c.field === "hsCode") return "major";
  const numbers = c.values
    .map((v) => (v.outcome.status === "value" ? v.outcome.value.number : undefined))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (numbers.length < 2) return "major";
  const max = Math.max(...numbers.map(Math.abs));
  const spread = Math.max(...numbers) - Math.min(...numbers);
  if (max === 0) return "major";
  const ratio = spread / max;
  if (ratio >= 0.1) return "major";
  if (ratio >= 0.02) return "moderate";
  return "minor";
}

export function computeRiskScore(result: CheckResult): RiskScore {
  const reasons: RiskReason[] = [];
  const unreadable = new Set(result.unreadableDocuments);

  for (const document of result.unreadableDocuments) {
    reasons.push({ code: "unreadableDocument", document, points: UNREADABLE_DOCUMENT_POINTS });
  }

  for (const c of result.comparisons) {
    if (c.status === "mismatch") {
      const severity = severityOf(c);
      const bonus = c.field === "hsCode" ? 0 : SEVERITY_BONUS[severity];
      reasons.push({ code: "mismatch", field: c.field, points: MISMATCH_POINTS[c.field] + bonus, severity, documents: c.comparedDocuments });
    } else if (c.status === "notCompared") {
      if (c.notComparedReason === "insufficientValues") {
        reasons.push({ code: "notComparable", field: c.field, points: NOT_COMPARABLE_POINTS });
      } else if (c.notComparedReason) {
        reasons.push({ code: "uncertainValues", field: c.field, points: UNCERTAIN_POINTS, reason: c.notComparedReason });
      }
      continue; // a field that could not be compared is scored once, not again per missing document
    }
    // Compared (match or mismatch) but absent from some readable documents. Unreadable documents are scored by R3.
    const missing = c.missingDocuments.filter((d) => !unreadable.has(d));
    if (missing.length > 0) {
      reasons.push({ code: "missingValue", field: c.field, points: MISSING_VALUE_POINTS * missing.length, documents: missing });
    }
  }

  reasons.sort((a, b) => b.points - a.points);
  const score = Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0));
  return { version: RISK_VERSION, score, level: levelFor(score), reasons };
}
