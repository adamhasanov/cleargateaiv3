/**
 * Pre-AI privacy masking (F9b). Pure text → text, no I/O, unit-tested.
 *
 * Masks identifying and financial details while keeping the business fields
 * the check needs (weights, quantities, amounts, HS codes, document numbers):
 *  - IBANs, card numbers (Luhn-checked), e-mail addresses, international phone numbers — by pattern;
 *  - tax IDs (VÖEN/TIN/ИНН/VAT…), bank accounts, SWIFT/BIC, phones — by their label;
 *  - contact persons, signatories, bank names, addresses — by their label;
 *  - company names — by legal form (Ltd, LLC, MMC, ASC, QSC, OJSC, ООО, АО, GmbH…);
 *  - the party blocks under Seller / Buyer / Consignor / Consignee / Declarant… headings (AZ/RU/EN).
 *
 * No mapping from placeholders back to originals is produced or kept: the
 * check only needs the business fields, so nothing has to be restored.
 *
 * Masking is rule-based. It cannot recognise a name that has no label, no
 * legal form and does not sit under a party heading. See README "Privacy".
 */

export type MaskCategory = "company" | "party" | "taxId" | "iban" | "account" | "swift" | "card" | "email" | "phone" | "person" | "bank" | "address";

export interface MaskResult {
  text: string;
  /** How many values of each kind were replaced (no values themselves). */
  counts: Partial<Record<MaskCategory, number>>;
}

const L = "\\p{L}"; // letter class (any script)

// Lines that carry the data the check needs are never wiped as party details.
const BUSINESS = /\b(kg|kgs|cartons?|ctn|pcs|pieces?|units?|gross|net|weight|quantity|qty|total|amount|value|price|usd|eur|azn|rub|hs|commodity|tariff|description|invoice|packing|marks|terms)\b|кг|брутто|нетто|итого|сумма|количество|вес|çəki|miqdar|cəm|məbləğ|qiymət|brutto|netto/iu;

/** A party block ends where the business content starts. */
const BLOCK_END = /\d[\d,.]*\s*(kg|kgs|cartons?|ctn|pcs)\b|\b(usd|eur|azn|rub)\b|\b(total|amount|description of goods|hs code|commodity code|terms)\b|итого|сумма|описание товара|məbləğ|malın təsviri/iu;

const PARTY_HEADING = new RegExp(
  "(?<![" + L + "])(seller|exporter|buyer|importer|consignor|consignee|shipper|declarant|notify party|sold to|ship to|bill to|supplier|customer|" +
    "satıcı|alıcı|ixracatçı|idxalçı|göndərən|alan|bəyannaməçi|təchizatçı|" +
    "продавец|покупатель|экспортер|импортер|отправитель|получатель|грузоотправитель|грузополучатель|декларант|поставщик)(?![" + L + "])",
  "iu",
);

const LEGAL_FORM =
  "LLC|L\\.L\\.C\\.|Ltd\\.?|Limited|Inc\\.?|Corp\\.?|Corporation|GmbH|AG|S\\.A\\.|SRL|S\\.r\\.l\\.|LLP|PLC|JSC|OJSC|CJSC|PJSC|OAO|ZAO|OOO|MMC|ASC|QSC|İB|ООО|ОАО|ЗАО|ПАО|АО|ИП";
// Up to five capitalised words (any script, with & . ' -) followed by a legal form.
const COMPANY = new RegExp(
  "(?<![" + L + "\\d])((?:[\\p{Lu}][" + L + "\\d&.'’-]*\\s+){1,5}(?:" + LEGAL_FORM + "))(?![" + L + "])",
  "gu",
);

// Quoted names with the legal form before (ООО «Ромашка», MMC "Xəzər") or after ("Xəzər" MMC).
const QUOTED_COMPANY = new RegExp(
  "(?<![" + L + "])(?:(?:" + LEGAL_FORM + ")\\s*[«\"“„'][^»\"”'\\n]{1,80}[»\"”']|[«\"“„][^»\"”\\n]{1,80}[»\"”]\\s*(?:" + LEGAL_FORM + "))(?![" + L + "])",
  "gu",
);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const INTL_PHONE = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;

const label = (words: string) => new RegExp("(?<![" + L + "])(" + words + ")(?![" + L + "])(\\s*(?:no\\.?|number|nr\\.?|№|#)?\\s*[:：#№]?\\s*)", "giu");
/** For free-text values (names, banks, addresses) the label must end with a colon, e.g. "Contact: …". */
const labelColon = (words: string) => new RegExp("(?<![" + L + "])(" + words + ")(?![" + L + "])(\\s*[:：]\\s*)", "giu");
const TAX_LABEL = label("vöen|voen|v[öo]en|tin|inn|инн|tax\\s*(?:id|no\\.?|number|code)|vat(?:\\s*(?:no\\.?|id|number))?|ein|reg(?:istration)?\\.?\\s*(?:no\\.?|number)|kpp|кпп|огрн|ogrn");
const ACCOUNT_LABEL = label("account|acc\\.?|a\\/c|bank account|correspondent account|hesab|h\\/h|müxbir hesab|счёт|счет|р\\/с|к\\/с|расчетный счет|корр\\.?\\s*счет");
const SWIFT_LABEL = label("swift(?:\\s*code)?|bic");
const PHONE_LABEL = label("tel\\.?|telephone|phone|mob\\.?|mobile|fax|telefon|mobil|тел\\.?|телефон|моб\\.?|факс");
const PERSON_LABEL = labelColon("contact(?:\\s*person)?|attn\\.?|attention|signature|signed by|director|manager|representative|declarant|prepared by|əlaqə(?:\\s*şəxsi)?|imza|direktor|nümayəndə|bəyannaməçi|контакт(?:ное лицо)?|подпись|директор|представитель|декларант");
const BANK_LABEL = labelColon("bank(?:\\s*name)?|beneficiary bank|bankın adı|bank adı|банк(?:\\s*получателя)?");
const ADDRESS_LABEL = labelColon("address|addr\\.?|ünvan|adres|адрес");
// "Buyer: John Smith" — a party label followed by its value on the same line.
const PARTY_LABEL = labelColon(
  "seller|exporter|buyer|importer|consignor|consignee|shipper|notify party|sold to|ship to|bill to|supplier|customer|company|firm|" +
    "satıcı|alıcı|ixracatçı|idxalçı|göndərən|alan|təchizatçı|şirkət|" +
    "продавец|покупатель|экспортер|импортер|отправитель|получатель|грузоотправитель|грузополучатель|поставщик|компания|организация",
);

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Splits a laid-out line into columns (2+ spaces or a tab), keeping the separators. */
const columns = (line: string) => line.split(/(\s{2,}|\t)/);

export function maskSensitiveText(input: string): MaskResult {
  const counts: MaskResult["counts"] = {};
  const tag = (c: MaskCategory) => {
    counts[c] = (counts[c] ?? 0) + 1;
    return `[${c.toUpperCase()}]`;
  };
  // Replace the value after a label (up to the end of its column).
  const afterLabel = (s: string, re: RegExp, c: MaskCategory, value: RegExp = /[^\s].*?(?=\s{2,}|\t|$)/) =>
    s.replace(new RegExp(re.source + "(" + value.source + ")", re.flags), (_m, lbl: string, sep: string) => `${lbl}${sep}${tag(c)}`);

  const lines = input.replace(/\r/g, "").split("\n");
  let partyLinesLeft = 0;

  const out = lines.map((raw) => {
    let line = raw;

    // 1. Pattern-detected values, anywhere.
    line = line.replace(EMAIL, () => tag("email"));
    line = line.replace(IBAN, () => tag("iban"));
    line = line.replace(CARD, (m) => (luhn(m.replace(/\D/g, "")) && m.replace(/\D/g, "").length >= 13 ? tag("card") : m));

    // 2. Label-detected values.
    line = afterLabel(line, TAX_LABEL, "taxId", /[A-Z]{0,2}\d[\d\s-]{4,18}\d/);
    line = afterLabel(line, SWIFT_LABEL, "swift", /[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?/);
    line = afterLabel(line, ACCOUNT_LABEL, "account", /[A-Z0-9][A-Z0-9 -]{6,40}[A-Z0-9]/);
    line = afterLabel(line, PHONE_LABEL, "phone", /[+()\d][\d\s().-]{5,20}\d/);
    line = line.replace(INTL_PHONE, () => tag("phone"));
    line = afterLabel(line, BANK_LABEL, "bank");
    line = afterLabel(line, ADDRESS_LABEL, "address");
    line = afterLabel(line, PERSON_LABEL, "person");

    // 3. Company names by legal form (quoted forms first), then any remaining "Party: value".
    line = line.replace(QUOTED_COMPANY, () => tag("company"));
    line = line.replace(COMPANY, () => tag("company"));
    line = afterLabel(line, PARTY_LABEL, "party");

    // 4. Party blocks: the lines under a Seller/Buyer/… heading hold names and addresses.
    const isHeading = PARTY_HEADING.test(raw) && !/[:：]\s*\S/.test(raw.replace(PARTY_HEADING, ""));
    if (isHeading) {
      partyLinesLeft = 6;
      return line;
    }
    if (partyLinesLeft > 0) {
      if (!raw.trim() || BLOCK_END.test(raw)) {
        partyLinesLeft = 0;
        return line;
      }
      partyLinesLeft -= 1;
      line = columns(line)
        .map((seg) => (/^\s*$/.test(seg) || /^\[[A-Z_]+\]$/.test(seg.trim()) || BUSINESS.test(seg) || /^\s*\d+\s*$/.test(seg) ? seg : seg.replace(/[^\s].*[^\s]|[^\s]/, () => tag("party"))))
        .join("");
    }
    return line;
  });

  return { text: out.join("\n"), counts };
}

/**
 * Fail-closed check run on the text that is about to leave the server:
 * returns the categories that still look sensitive (never the values).
 */
export function residualSensitive(text: string): MaskCategory[] {
  const found = new Set<MaskCategory>();
  if (new RegExp(EMAIL.source).test(text)) found.add("email");
  if (new RegExp(IBAN.source).test(text)) found.add("iban");
  if (new RegExp(TAX_LABEL.source + "[A-Z]{0,2}\\d[\\d\\s-]{4,18}\\d", "iu").test(text)) found.add("taxId");
  if (new RegExp(SWIFT_LABEL.source + "[A-Z]{6}[A-Z0-9]{2}", "iu").test(text)) found.add("swift");
  for (const m of text.match(new RegExp(CARD.source, "g")) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && luhn(digits)) found.add("card");
  }
  return [...found];
}
