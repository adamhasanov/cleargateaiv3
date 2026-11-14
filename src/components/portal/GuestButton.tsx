"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { getPlan } from "@/lib/billing/plans";
import { api, errorText } from "@/lib/client/http";
import { setMe, type Me } from "@/lib/client/session";
import { AlertCircleIcon, ArrowRightIcon } from "../Icons";

/** "Try without signing up": one click → temporary guest account → straight to the document check. */
export function GuestButton({ next }: { next?: string }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<{ user: Me }>("/api/auth/guest", { body: { locale } });
    if (r.ok) {
      setMe(r.data.user);
      router.replace(next ?? `/${locale}/check`);
      return;
    }
    setBusy(false);
    setError(errorText(dict.portal.errors, r.error));
  }

  return (
    <div className="guest">
      <p className="guest__or" aria-hidden="true"><span>{t.guestOr}</span></p>
      <button type="button" className="btn btn--outline btn--block guest__btn" onClick={start} disabled={busy}>
        {busy ? t.working : t.guestCta}
        {!busy && <ArrowRightIcon size={18} />}
      </button>
      <p className="field__hint guest__hint">{format(t.guestHint, { count: getPlan("free")!.monthlyCheckLimit ?? 0 })}</p>
      {error && (
        <p className="form-message form-message--error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
