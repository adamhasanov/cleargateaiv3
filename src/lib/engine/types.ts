/**
 * Shared types for the check pipeline.
 *
 * Boundary B-3 (extraction → outcome handling) produces `DocumentExtraction`.
 * Boundary B-4/B-5 (outcome handling → rule engine → result) consumes it and
 * produces `CheckResult`. Everything from B-4 onward is deterministic.
 */

export const DOCUMENT_IDS = ["invoice", "packingList", "customsDocument"] as const;
export type DocumentId = (typeof DOCUMENT_IDS)[number];

export const FIELD_IDS = ["weight", "quantity", "price", "hsCode"] as const;
export type FieldId = (typeof FIELD_IDS)[number];

/** Weight basis as stated on the document. Only used for the weight field. */
export type WeightBasis = "gross" | "net" | "unspecified";

/** A value as read from a document. Nothing here is converted or inferred. */
export interface ExtractedValue {
  /** The text exactly as it appears in the document, e.g. "1,250 kg". */
  raw: string;
  /** Numeric part, for weight, quantity and price. */
  number?: number;
  /** Unit (weight, quantity) or currency (price), as written. */
  unit?: string;
  /** HS code as written (weight/quantity/price leave this empty). */
  code?: string;
  /** Weight only. */
  basis?: WeightBasis;
}

/** FR-025: exactly one outcome per document and field. */
export type FieldOutcome =
  | { status: "value"; value: ExtractedValue }
  | { status: "notFound" }
  | { status: "notApplicable" };

export interface DocumentExtraction {
  document: DocumentId;
  /** false when the document could not be read at all (EX-03). */
  readable: boolean;
  fields: Record<FieldId, FieldOutcome>;
}

/** Why a field could not be compared (FR-032). */
export type NotComparedReason =
  | "insufficientValues" // fewer than two documents carry a value
  | "unitDiffers" // values use different units / currencies — no silent conversion
  | "basisDiffers" // e.g. gross vs net weight
  | "unparsable"; // a value was found but its number/code could not be read

export interface FieldValueEntry {
  document: DocumentId;
  outcome: FieldOutcome;
  /** true when the whole document was unreadable */
  documentUnreadable: boolean;
}

export type FieldStatus = "match" | "mismatch" | "notCompared";

export interface FieldComparison {
  field: FieldId;
  status: FieldStatus;
  /** Identity of the rule that produced the status (FR-034). */
  ruleId: "RS-01" | "RS-02" | "RS-03" | "RS-04" | "RS-05";
  values: FieldValueEntry[];
  /** Documents whose value took part in the comparison. */
  comparedDocuments: DocumentId[];
  /** Expected documents where the value is missing or unreadable. */
  missingDocuments: DocumentId[];
  notComparedReason?: NotComparedReason;
  /** For numeric mismatches between exactly two distinct values. */
  difference?: number;
}

export type ResultClass =
  | "mismatchesFound"
  | "mismatchesFoundIncomplete"
  | "noMismatch"
  | "incomplete";

export interface CheckResult {
  /** Version tag of the rule set used, for traceability. */
  ruleSetVersion: string;
  resultClass: ResultClass;
  comparisons: FieldComparison[];
  unreadableDocuments: DocumentId[];
}
