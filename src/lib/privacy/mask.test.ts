import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sampleData from "../../../samples/sample-sets.json";
import { DocumentTextError, extractDocumentText } from "./document-text";
import { maskSensitiveText, residualSensitive } from "./mask";
import { prepareDocumentForAI } from "./prepare";

const { seller, buyer, declarant } = sampleData.shared;
const digits = (s: string) => s.replace(/\D/g, "");

/** Every identifying value printed on the sample documents. */
const SENSITIVE = [
  seller.name, buyer.name, declarant.name, "Sample Commercial Bank",
  ...seller.address, ...buyer.address,
  seller.email, buyer.email, seller.phone, buyer.phone,
  "Aysel Mammadova", "Rashad Aliyev", "SAMPAZ22", "AZ77SAMP00000000001234567890",
  digits(seller.taxId), digits(buyer.taxId), digits(declarant.taxId),
].filter((s) => !/^(Azerbaijan|Sampleland)$/.test(s));

const FILES = { invoice: "1-invoice.pdf", packingList: "2-packing-list.pdf", customsDocument: "3-customs-declaration.pdf" } as const;
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

describe("pre-AI masking of the sample documents (real PDF text, real masking)", () => {
  for (const set of sampleData.sets) {
    for (const [doc, file] of Object.entries(FILES) as [keyof typeof FILES, string][]) {
      it(`${set.id}/${file}: removes every sensitive value and keeps the business fields`, async () => {
        const d = set.documents[doc];
        const prepared = await prepareDocumentForAI(new Uint8Array(readFileSync(`public/samples/${set.id}/${file}`)), "application/pdf");
        const compact = prepared.text.replace(/\s+/g, "");
        for (const value of SENSITIVE) {
          expect(prepared.text, `"${value}" leaked`).not.toContain(value);
          if (/^\d{8,}$/.test(value)) expect(compact, `digits ${value} leaked`).not.toContain(value);
        }
        // Business fields survive exactly as printed.
        expect(prepared.text).toContain(fmt(d.grossKg));
        expect(prepared.text).toContain(fmt(d.netKg));
        expect(prepared.text).toMatch(new RegExp(`\\b${d.cartons}\\b`));
        if (d.total !== null) expect(prepared.text).toContain(fmt(d.total));
        if (d.hsCode !== null) expect(prepared.text).toContain(d.hsCode);
        expect(residualSensitive(prepared.text)).toEqual([]);
        expect(prepared.source).toBe("pdf-text");
      });
    }
  }
});

describe("masking rules", () => {
  it("masks IBANs (with or without spaces), e-mails, international phones and labelled IDs", () => {
    const { text, counts } = maskSensitiveText(
      [
        "IBAN: AZ21 NABZ 0000 0000 1370 1000 1944",
        "Hesab: AZ21NABZ00000000137010001944",
        "VÖEN: 1234567891   VAT No. GB123456789",
        "ИНН 7701234567",
        "SWIFT code: NABZAZ2X",
        "Tel: (012) 498 77 66   e-mail: info@firma.az",
        "Mob +994 55 123 45 67",
        "Account No: 40702810900000001234",
      ].join("\n"),
    );
    for (const leaked of ["NABZ", "1370", "1234567891", "GB123456789", "7701234567", "NABZAZ2X", "498 77 66", "info@firma.az", "123 45 67", "40702810900000001234"]) {
      expect(text).not.toContain(leaked);
    }
    expect(counts).toMatchObject({ iban: 2, email: 1 });
  });

  it("masks company names by legal form in Latin and Cyrillic, and labelled people, banks and addresses", () => {
    const { text } = maskSensitiveText(
      [
        "Supplier: Caspian Tile Trading MMC", "Получатель: ООО «Ромашка»", "Kapital Trade ASC and Baku Steel Company LLC",
        "\"Xəzər Kərpic\" MMC sifariş verib", "Buyer: John Smith", "Contact: Leyla Hasanova", "Ünvan: Nizami küç. 10, Bakı", "Банк: Kapital Bank",
      ].join("\n"),
    );
    for (const leaked of ["Caspian Tile Trading", "Ромашка", "Kapital Trade", "Baku Steel Company", "Xəzər Kərpic", "John Smith", "Leyla Hasanova", "Nizami", "Kapital Bank"]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("keeps weights, quantities, amounts, HS codes (incl. 10-digit) and document numbers", () => {
    const input = [
      "Invoice No. INV-2026-0042   Date: 2026-11-01",
      "HS code: 6907210000   Qty: 480 pcs   Gross weight: 1 250,50 kg",
      "Total amount: 18,500.00 USD   Нетто: 1 150 кг   Cəmi məbləğ: 31 450,00 AZN",
    ].join("\n");
    const { text } = maskSensitiveText(input);
    expect(text).toBe(input);
  });

  it("only treats a long number as a card when it passes the Luhn check", () => {
    expect(maskSensitiveText("Card 4111 1111 1111 1111").text).toContain("[CARD]");
    expect(maskSensitiveText("Ref 1234 5678 9012 3456").text).toContain("1234 5678 9012 3456");
  });

  it("masks the lines under a party heading but stops at the goods data", () => {
    const { text } = maskSensitiveText(["Satıcı / Seller", "Xəzər Kərpic", "Bakı şəhəri, Neftçilər pr. 5", "Description of goods  Bricks  1 000 pcs"].join("\n"));
    expect(text).not.toContain("Xəzər Kərpic");
    expect(text).not.toContain("Neftçilər");
    expect(text).toContain("Description of goods  Bricks  1 000 pcs");
  });

  it("fail-closed check reports what is still sensitive (categories only)", () => {
    expect(residualSensitive("pay to AZ77SAMP00000000001234567890 or mail a@b.az")).toEqual(["email", "iban"]);
    expect(residualSensitive("[IBAN] [EMAIL] 1,250.00 kg")).toEqual([]);
  });
});

describe("scanned documents", () => {
  it("refuses a PDF without a text layer instead of sending it unmasked", async () => {
    await expect(extractDocumentText(new Uint8Array(readFileSync("test/fixtures/scanned-invoice.pdf")), "application/pdf")).rejects.toMatchObject({
      code: "scannedPdf",
    });
    expect(DocumentTextError).toBeDefined();
  });

  it("reads a scanned image with local OCR, then masks it before any AI call", async () => {
    const prepared = await prepareDocumentForAI(new Uint8Array(readFileSync("test/fixtures/scanned-invoice.png")), "image/png");
    expect(prepared.source).toBe("ocr");
    // OCR found the business data …
    expect(prepared.text).toMatch(/1,250\.00\s*kg/);
    expect(prepared.text).toMatch(/18,500\.00/);
    // … and the identifying data is gone.
    for (const value of ["Sample Ceramics Export", "Sample Import", "sales@sample-ceramics.example", "AZ77SAMP", "SAMPAZ22", "Aysel Mammadova", "1402345671", "1708912345"]) {
      expect(prepared.text, `"${value}" leaked from OCR text`).not.toContain(value);
    }
    expect(residualSensitive(prepared.text)).toEqual([]);
  }, 180_000);
});
