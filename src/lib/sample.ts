import type { DocumentExtraction } from "@/lib/engine/types";

/**
 * PREPARED SAMPLE values for demonstration only (MVP_SCOPE 9.5).
 * Fictional. Never presented as a live reading; the result screen labels it.
 * Weight 1,250 kg vs 1,200 kg is the approved illustrative example; the price
 * difference mirrors the owner's design reference. The HS code is a placeholder.
 */
export const SAMPLE_EXTRACTIONS: DocumentExtraction[] = [
  {
    document: "invoice",
    readable: true,
    fields: {
      weight: { status: "value", value: { raw: "1,250 kg", number: 1250, unit: "kg", basis: "gross" } },
      quantity: { status: "value", value: { raw: "40 cartons", number: 40, unit: "cartons" } },
      price: { status: "value", value: { raw: "18,500 USD", number: 18500, unit: "USD" } },
      hsCode: { status: "value", value: { raw: "0000.00", code: "0000.00" } },
    },
  },
  {
    document: "packingList",
    readable: true,
    fields: {
      weight: { status: "value", value: { raw: "1,200 kg", number: 1200, unit: "kg", basis: "gross" } },
      quantity: { status: "value", value: { raw: "40 cartons", number: 40, unit: "cartons" } },
      price: { status: "notFound" },
      hsCode: { status: "value", value: { raw: "0000.00", code: "0000.00" } },
    },
  },
  {
    document: "customsDocument",
    readable: true,
    fields: {
      weight: { status: "value", value: { raw: "1,250 kg", number: 1250, unit: "kg", basis: "gross" } },
      quantity: { status: "value", value: { raw: "40 cartons", number: 40, unit: "cartons" } },
      price: { status: "value", value: { raw: "18,000 USD", number: 18000, unit: "USD" } },
      hsCode: { status: "value", value: { raw: "0000.00", code: "0000.00" } },
    },
  },
];
