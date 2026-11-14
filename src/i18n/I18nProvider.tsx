"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getDictionary, type Dictionary, type Locale } from "./config";

interface I18nValue {
  locale: Locale;
  dict: Dictionary;
  /**
   * Switches language without leaving the page. Used inside the check flow so
   * that files and results held in memory survive a language change.
   */
  switchInPlace: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initial);
  const [routeLocale, setRouteLocale] = useState<Locale>(initial);

  // A new route locale (normal navigation) wins over an earlier in-place switch.
  if (routeLocale !== initial) {
    setRouteLocale(initial);
    setLocale(initial);
  }
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const switchInPlace = useCallback((next: Locale) => {
    const parts = window.location.pathname.split("/");
    parts[1] = next;
    window.history.replaceState(null, "", parts.join("/") + window.location.search + window.location.hash);
    setLocale(next);
  }, []);

  const value = useMemo(() => ({ locale, dict: getDictionary(locale), switchInPlace }), [locale, switchInPlace]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
