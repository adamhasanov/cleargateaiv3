import { z } from "zod";
import { FIELD_COVERAGE } from "@/lib/config/documents";
import type { DocumentExtraction, DocumentId, FieldOutcome } from "@/lib/engine/types";

/**
 * Structured output the AI extraction component must return (DEC-03 output
 * format is open; this is a working format). It carries values only — no
 * match decision, no risk, no legal statement (FR-023).
 */
const numericField = z.object({
  found: z.boolean().describe("true only if the value is printed on the document"),
  raw: z.string().nullable().describe("the value exactly as printed, including unit or currency"),
  number: z.number().nullable().describe("numeric part as printed, without thousand separators"),
  unit: z.string().nullable().describe("unit or currency exactly as printed, e.g. kg, pcs, cartons, USD"),
});

export const extractionSchema = z.object({
  readable: z.boolean().describe("false if the document cannot be read at all"),
  weight: numericField.extend({
    basis: z.enum(["gross", "net", "unspecified"]).describe("which weight was printed"),
  }),
  quantity: numericField,
  price: numericField,
  hsCode: z.object({
    found: z.boolean(),
    raw: z.string().nullable().describe("HS code exactly as printed"),
  }),
});

export type RawExtraction = z.infer<typeof extractionSchema>;

/**
 * M-04 extraction outcome handling: raw extraction → one outcome per field.
 * Never invents a value (FR-024). A value without a readable number becomes a
 * value with no number, which the rule engine reports as "not compared".
 */
export function toDocumentExtraction(document: DocumentId, raw: RawExtraction): DocumentExtraction {
  const missing = (field: keyof typeof FIELD_COVERAGE.invoice): FieldOutcome =>
    FIELD_COVERAGE[document][field] ? { status: "notFound" } : { status: "notApplicable" };

  const numeric = (
    field: "weight" | "quantity" | "price",
    f: RawExtraction["weight"] | RawExtraction["quantity"],
  ): FieldOutcome => {
    if (!f.found || !f.raw?.trim()) return missing(field);
    return {
      status: "value",
      value: {
        raw: f.raw.trim(),
        number: typeof f.number === "number" && Number.isFinite(f.number) ? f.number : undefined,
        unit: f.unit?.trim() || undefined,
        basis: "basis" in f ? f.basis : undefined,
      },
    };
  };

  if (!raw.readable) {
    return {
      document,
      readable: false,
      fields: {
        weight: missing("weight"),
        quantity: missing("quantity"),
        price: missing("price"),
        hsCode: missing("hsCode"),
      },
    };
  }

  return {
    document,
    readable: true,
    fields: {
      weight: numeric("weight", raw.weight),
      quantity: numeric("quantity", raw.quantity),
      price: numeric("price", raw.price),
      hsCode:
        raw.hsCode.found && raw.hsCode.raw?.trim()
          ? { status: "value", value: { raw: raw.hsCode.raw.trim(), code: raw.hsCode.raw.trim() } }
          : missing("hsCode"),
    },
  };
}
