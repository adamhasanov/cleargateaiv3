import { format, type Dictionary, type Locale } from "@/i18n/config";
import type { DocumentId, FieldComparison, FieldValueEntry } from "@/lib/engine/types";

/**
 * M-05 explanation and fix content (DEC-11 is open).
 * Working choice: fixed templates per finding type — deterministic, no AI call,
 * produced AFTER comparison and unable to change it (ARC-D-05).
 */

export function formatNumber(n: number, locale: Locale): string {
  const tag = locale === "az" ? "az-Latn-AZ" : locale === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(tag, { maximumFractionDigits: 6 }).format(n);
}

export function joinDocs(docs: DocumentId[], dict: Dictionary): string {
  const names = docs.map((d) => dict.documents[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${dict.common.and} ${names[names.length - 1]}`;
}

/** The value as read, exactly as printed on the document. */
export function displayValue(entry: FieldValueEntry, dict: Dictionary): string {
  if (entry.outcome.status === "value") {
    const v = entry.outcome.value;
    const basis = v.basis && v.basis !== "unspecified" ? ` (${dict.basis[v.basis]})` : "";
    return `${v.raw}${basis}`;
  }
  if (entry.documentUnreadable) return dict.results.valueUnreadable;
  if (entry.outcome.status === "notApplicable") return dict.results.valueNotApplicable;
  return dict.results.valueNotFound;
}

function valueList(c: FieldComparison, dict: Dictionary): string {
  return c.values
    .filter((e) => c.comparedDocuments.includes(e.document) || e.outcome.status === "value")
    .map((e) => `${dict.documents[e.document]} — ${displayValue(e, dict)}`)
    .join("; ");
}

function unitOf(c: FieldComparison): string {
  const first = c.values.find((e) => e.outcome.status === "value");
  return first && first.outcome.status === "value" ? first.outcome.value.unit ?? "" : "";
}

export interface Explanation {
  explanation: string;
  fix: string;
}

export function explain(c: FieldComparison, dict: Dictionary, locale: Locale): Explanation {
  const field = dict.fields[c.field];
  const values = valueList(c, dict);
  const missing = c.missingDocuments.length
    ? " " + format(dict.explain.partlyMissing, { docs: joinDocs(c.missingDocuments, dict) })
    : "";
  const missingFix = c.missingDocuments.length
    ? format(dict.explain.fix.missing, { field, docs: joinDocs(c.missingDocuments, dict) })
    : "";

  if (c.status === "mismatch") {
    let text = format(dict.explain.mismatch, { field, values });
    if (c.difference !== undefined) {
      const unit = unitOf(c);
      text += " " + format(dict.explain.difference, { difference: `${formatNumber(c.difference, locale)}${unit ? " " + unit : ""}` });
    }
    return { explanation: text + missing, fix: [dict.explain.fix[c.field], missingFix].filter(Boolean).join(" ") };
  }

  if (c.status === "match") {
    return { explanation: format(dict.explain.match, { field, values }) + missing, fix: missingFix };
  }

  switch (c.notComparedReason) {
    case "unitDiffers":
      return { explanation: format(dict.explain.unitDiffers, { values }) + missing, fix: dict.explain.fix.unit };
    case "basisDiffers":
      return { explanation: dict.explain.basisDiffers + missing, fix: dict.explain.fix.basis };
    case "unparsable":
      return { explanation: format(dict.explain.unparsable, { values }) + missing, fix: dict.explain.fix.unparsable };
    default:
      return {
        explanation: format(dict.explain.insufficientValues, { field }) + missing,
        fix: missingFix || dict.explain.fix.unparsable,
      };
  }
}
