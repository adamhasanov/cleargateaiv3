import Link from "next/link";
import type { Locale } from "@/i18n/config";

/** ClearGateAI mark: a gate shape that closes over a check line. */
export function Logo({ locale }: { locale: Locale }) {
  return (
    <Link href={`/${locale}`} className="logo" aria-label="ClearGateAI">
      <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
        <path d="M17 2 31 26H3z" fill="none" stroke="#00D6C3" strokeWidth="3.2" strokeLinejoin="round" />
        <path d="M10.5 18.5 15 23l8.5-9.5" fill="none" stroke="#EAF4F5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="logo__text">ClearGate<span className="logo__ai">AI</span></span>
    </Link>
  );
}
