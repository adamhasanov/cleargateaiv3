import az, { type Dictionary } from "./dictionaries/az";
import en from "./dictionaries/en";
import ru from "./dictionaries/ru";

export const LOCALES = ["az", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "az";

export const LOCALE_NAMES: Record<Locale, string> = { az: "Azərbaycan", ru: "Русский", en: "English" };

const DICTIONARIES: Record<Locale, Dictionary> = { az, ru, en };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** Replaces {name} placeholders. Unknown placeholders are left as-is. */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export type { Dictionary };
