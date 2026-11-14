"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { ChevronDownIcon, GlobeIcon } from "./Icons";

/** Replaces the locale segment of the current path, keeping the rest of the route. */
function pathFor(pathname: string, target: Locale): string {
  const parts = pathname.split("/");
  parts[1] = target;
  return parts.join("/") || `/${target}`;
}

export function LanguageSwitcher({ disabled = false, inPlace = false }: { disabled?: boolean; inPlace?: boolean }) {
  const { locale, dict, switchInPlace } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lang" ref={ref}>
      <button
        type="button"
        className="lang__button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${dict.nav.language}: ${LOCALE_NAMES[locale]}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
      >
        <GlobeIcon size={18} />
        <span>{locale.toUpperCase()}</span>
        <ChevronDownIcon size={16} />
      </button>
      {open && (
        <ul className="lang__menu">
          {LOCALES.map((l) => (
            <li key={l}>
              <Link
                href={pathFor(pathname, l)}
                className="lang__option"
                aria-current={l === locale ? "true" : undefined}
                lang={l}
                hrefLang={l}
                onClick={(e) => {
                  setOpen(false);
                  if (inPlace) {
                    e.preventDefault();
                    switchInPlace(l);
                  }
                }}
              >
                <span className="lang__code">{l.toUpperCase()}</span>
                {LOCALE_NAMES[l]}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
