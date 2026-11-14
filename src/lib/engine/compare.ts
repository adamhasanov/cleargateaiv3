import { FIELD_COVERAGE } from "@/lib/config/documents";
import {
  DOCUMENT_IDS,
  FIELD_IDS,
  type CheckResult,
  type DocumentExtraction,
  type DocumentId,
  type ExtractedValue,
  type FieldComparison,
  type FieldId,
  type FieldValueEntry,
  type ResultClass,
} from "./types";

/**
 * Deterministic rule engine (F3, FR-005, FR-029 to FR-034).
 *
 * - No AI call. No randomness. No clock. Same input → same output (FR-030).
 * - Exact comparison of values as extracted. No tolerance (DEC-07 open,
 *   ARC-A-04). No unit or currency conversion (RG-01 open, ARC-D-09).
 * - A field with a value in fewer than two documents is "not compared" and is
 *   never a match or a mismatch (FR-032).
 * - Missing or unreadable data is never presented as clean (FR-044).
 */

export const RULE_SET_VERSION = "cg-rules-1";

/** Rule identities (SYSTEM_ARCHITECTURE 6.3). Localised descriptions live in the dictionaries. */
export const RULE_IDS = { weight: "RS-01", quantity: "RS-02", price: "RS-03", hsCode: "RS-04" } as const satisfies Record<FieldId, string>;
export const RULE_NOT_COMPARABLE = "RS-05";
export type RuleId = (typeof RULE_IDS)[FieldId] | typeof RULE_NOT_COMPARABLE;

/**
 * Spelling aliases only — these are the same unit written differently.
 * No conversion between different units is performed (e.g. t ≠ kg).
 */
const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", "кг": "kg",
  pc: "pcs", pcs: "pcs", piece: "pcs", pieces: "pcs", "ədəd": "pcs", "шт": "pcs",
  "us$": "usd", $: "usd", "€": "eur", "₼": "azn", manat: "azn",
};

export function canonicalUnit(unit: string | undefined): string {
  if (!unit) return "";
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[u] ?? u;
}

/** HS code formatting characters (dots, spaces, dashes) are ignored; digits are compared exactly. */
export function canonicalHsCode(code: string | undefined): string | null {
  if (!code) return null;
  const digits = code.replace(/[\s.\-]/g, "");
  return /^\d+$/.test(digits) ? digits : null;
}

function collectEntries(field: FieldId, docs: Map<DocumentId, DocumentExtraction>): FieldValueEntry[] {
  return DOCUMENT_IDS.map((document) => {
    const extraction = docs.get(document);
    if (!extraction || !extraction.readable) {
      return {
        document,
        outcome: FIELD_COVERAGE[document][field] ? { status: "notFound" } : { status: "notApplicable" },
        documentUnreadable: true,
      };
    }
    return { document, outcome: extraction.fields[field], documentUnreadable: false };
  });
}

function compareField(field: FieldId, entries: FieldValueEntry[]): FieldComparison {
  const withValue = entries.filter(
    (e): e is FieldValueEntry & { outcome: { status: "value"; value: ExtractedValue } } =>
      e.outcome.status === "value",
  );
  const missingDocuments = entries
    .filter((e) => e.outcome.status === "notFound" || (e.documentUnreadable && FIELD_COVERAGE[e.document][field]))
    .map((e) => e.document);

  const base = { field, values: entries, missingDocuments };

  if (withValue.length < 2) {
    return {
      ...base,
      status: "notCompared",
      ruleId: RULE_NOT_COMPARABLE,
      comparedDocuments: [],
      notComparedReason: "insufficientValues",
    };
  }

  const comparedDocuments = withValue.map((e) => e.document);
  const ruleId = RULE_IDS[field];

  if (field === "hsCode") {
    const codes = withValue.map((e) => canonicalHsCode(e.outcome.value.code ?? e.outcome.value.raw));
    if (codes.some((c) => c === null)) {
      return { ...base, status: "notCompared", ruleId: RULE_NOT_COMPARABLE, comparedDocuments: [], notComparedReason: "unparsable" };
    }
    const distinct = new Set(codes);
    return { ...base, status: distinct.size === 1 ? "match" : "mismatch", ruleId, comparedDocuments };
  }

  // Numeric fields: weight, quantity, price.
  const numbers = withValue.map((e) => e.outcome.value.number);
  if (numbers.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    return { ...base, status: "notCompared", ruleId: RULE_NOT_COMPARABLE, comparedDocuments: [], notComparedReason: "unparsable" };
  }
  const units = new Set(withValue.map((e) => canonicalUnit(e.outcome.value.unit)));
  if (units.size > 1) {
    return { ...base, status: "notCompared", ruleId: RULE_NOT_COMPARABLE, comparedDocuments: [], notComparedReason: "unitDiffers" };
  }
  if (field === "weight") {
    const bases = new Set(withValue.map((e) => e.outcome.value.basis ?? "unspecified"));
    if (bases.size > 1) {
      return { ...base, status: "notCompared", ruleId: RULE_NOT_COMPARABLE, comparedDocuments: [], notComparedReason: "basisDiffers" };
    }
  }

  const distinct = [...new Set(numbers as number[])];
  if (distinct.length === 1) {
    return { ...base, status: "match", ruleId, comparedDocuments };
  }
  const result: FieldComparison = { ...base, status: "mismatch", ruleId, comparedDocuments };
  if (distinct.length === 2) {
    // Rounded to avoid binary floating-point noise in display (e.g. 0.1 + 0.2).
    result.difference = Math.round(Math.abs(distinct[0] - distinct[1]) * 1e6) / 1e6;
  }
  return result;
}

function classify(comparisons: FieldComparison[], unreadable: DocumentId[]): ResultClass {
  const hasMismatch = comparisons.some((c) => c.status === "mismatch");
  const incomplete =
    unreadable.length > 0 ||
    comparisons.some((c) => c.status === "notCompared" || c.missingDocuments.length > 0);
  if (hasMismatch) return incomplete ? "mismatchesFoundIncomplete" : "mismatchesFound";
  return incomplete ? "incomplete" : "noMismatch";
}

export function runCheck(extractions: DocumentExtraction[]): CheckResult {
  const docs = new Map<DocumentId, DocumentExtraction>();
  for (const e of extractions) docs.set(e.document, e);

  const comparisons = FIELD_IDS.map((field) => compareField(field, collectEntries(field, docs)));
  const unreadableDocuments = DOCUMENT_IDS.filter((d) => !docs.get(d)?.readable);

  return {
    ruleSetVersion: RULE_SET_VERSION,
    resultClass: classify(comparisons, unreadableDocuments),
    comparisons,
    unreadableDocuments,
  };
}
