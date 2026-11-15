"use client";

import { useRouter } from "next/navigation";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { getPlan } from "@/lib/billing/plans";
import { signIn } from "@/lib/client/demo";
import { ArrowRightIcon } from "../Icons";

const GUEST_NAMES = { az: "Qonaq", ru: "Гость", en: "Guest" } as const;

/** "Try without signing up": one click → demo profile in this browser → straight to the document check. */
export function GuestButton({ next }: { next?: string }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const router = useRouter();

  function start() {
    signIn({ email: "guest@demo.local", name: GUEST_NAMES[locale], locale });
    router.replace(next ?? `/${locale}/check`);
  }

  return (
    <div className="guest">
      <p className="guest__or" aria-hidden="true"><span>{t.guestOr}</span></p>
      <button type="button" className="btn btn--outline btn--block guest__btn" onClick={start}>
        {t.guestCta}
        <ArrowRightIcon size={18} />
      </button>
      <p className="field__hint guest__hint">{format(t.guestHint, { count: getPlan("free")!.monthlyCheckLimit ?? 0 })}</p>
    </div>
  );
}
