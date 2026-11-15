"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { formatMoney } from "@/lib/client/format";
import { CheckCircleIcon, InfoIcon, Spinner } from "../Icons";

/**
 * FAKE payment window (MVP simulation). It has no card fields, reads no card data,
 * contacts no payment provider and charges nothing: "Pay" just waits a moment and succeeds.
 */
export function FakeCheckout({ title, amountMinor, onPaid, onCancel }: { title: string; amountMinor: number; onPaid: () => void; onCancel: () => void }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.plans;
  const [state, setState] = useState<"idle" | "paying" | "paid">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function pay() {
    setState("paying");
    timer.current = setTimeout(() => {
      setState("paid");
      timer.current = setTimeout(onPaid, 1200);
    }, 1500);
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="fakepay-title" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="panel" style={{ maxWidth: 420, width: "100%" }}>
        <h2 id="fakepay-title" className="panel__title">{t.fakePayTitle}</h2>
        <p className="panel__text">{title}</p>
        <p className="plan__price">{formatMoney(amountMinor, "AZN", locale)}</p>
        <p className="notice notice--warning"><InfoIcon size={20} /><span>{t.fakePayNote}</span></p>
        {state === "paid" ? (
          <p className="form-message form-message--success" role="status"><CheckCircleIcon size={18} /><span>{t.fakePaid}</span></p>
        ) : (
          <div className="portal-actions">
            <button type="button" className="btn btn--primary" onClick={pay} disabled={state === "paying"}>
              {state === "paying" ? <><Spinner size={16} /> {t.fakePaying}</> : t.fakePayCta}
            </button>
            <button type="button" className="btn btn--outline" onClick={onCancel} disabled={state === "paying"}>{t.fakeCancel}</button>
          </div>
        )}
      </div>
    </div>
  );
}
