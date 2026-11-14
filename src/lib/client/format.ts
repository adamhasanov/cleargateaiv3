const TAG = { az: "az-AZ", ru: "ru-RU", en: "en-GB" } as const;
type Lang = keyof typeof TAG;

/**
 * Some browsers ship without Azerbaijani month names (Intl renders "2027 M01 14"),
 * so Azerbaijani dates are composed from this list instead.
 */
const AZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "14 yanvar 2027" / "14 января 2027 г." / "14 January 2027" (+ local time). */
export function formatDate(iso: string | Date, locale: Lang, withTime = false): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (locale === "az") {
    const date = `${d.getDate()} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    return withTime ? `${date}, ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
  }
  return new Intl.DateTimeFormat(TAG[locale], {
    day: "numeric", month: "long", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

/** Amount in minor units (qəpik) → "12.50 AZN". */
export function formatMoney(minor: number, currency: string, locale: Lang): string {
  return `${new Intl.NumberFormat(TAG[locale], { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} ${currency}`;
}
