"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { api, errorText } from "@/lib/client/http";
import { formatMoney } from "@/lib/client/format";
import type { PaymentRecord } from "@/lib/payments/service";
import { AppShell } from "../check/AppShell";
import { AlertCircleIcon, CheckCircleIcon, ClockIcon, RefreshIcon } from "../Icons";
import { RequireUser } from "./RequireUser";

/** Return page after the bank: shows the server's payment status, re-checking while it is pending. */
export function PaymentStatus({ id }: { id: string }) {
  return (
    <AppShell>
      <RequireUser>{() => <Body id={id} />}</RequireUser>
    </AppShell>
  );
}

function Body({ id }: { id: string }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.payments;
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);

  const load = useCallback(() => {
    return api<{ payment: PaymentRecord }>(`/api/payments/${id}`).then((r) => {
      if (r.ok) {
        setPayment(r.data.payment);
        setError(null);
      } else if (r.status === 0 || r.status >= 500) {
        // Network or server hiccup (e.g. a flaky mobile connection right after the bank page): retry, don't stop.
        setError(errorText(dict.portal.errors, r.error));
      } else {
        setError(errorText(dict.portal.errors, r.error));
        setPolls(Number.POSITIVE_INFINITY); // permanent (not found / signed out): stop asking
      }
    });
  }, [id, dict.portal.errors]);

  // First load immediately; then every 3 s while pending or after a transient error, for up to 2 minutes.
  useEffect(() => {
    if (polls >= 40) return;
    if (payment && payment.status !== "pending") return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      void load();
    }, polls === 0 ? 0 : 3000);
    return () => clearTimeout(timer);
  }, [payment, polls, load]);

  if (!payment) {
    return error ? (
      <p className="form-message form-message--error" role="alert"><AlertCircleIcon size={18} /><span>{error}</span></p>
    ) : (
      <p className="portal-loading" role="status">{dict.portal.common.loading}</p>
    );
  }

  const Icon = payment.status === "succeeded" ? CheckCircleIcon : payment.status === "failed" ? AlertCircleIcon : ClockIcon;
  const title = payment.status === "succeeded" ? t.succeededTitle : payment.status === "failed" ? t.failedTitle : t.pendingTitle;
  const text = payment.status === "succeeded" ? t.succeededText : payment.status === "failed" ? t.failedText : t.pendingText;

  return (
    <section className={`pay-result pay-result--${payment.status}`} aria-live="polite">
      <Icon size={40} />
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{text}</p>
      <p className="pay-result__amount">
        {payment.purpose === "check_credit" ? t.itemCredit : `${dict.portal.plans.names[payment.planCode!]} · ${payment.billingPeriod === "annual" ? dict.portal.plans.annual : dict.portal.plans.monthly}`}
        {" — "}
        {formatMoney(payment.amountMinor, payment.currency, locale)}
      </p>
      <div className="portal-actions">
        {payment.status === "pending" && (
          <button type="button" className="btn btn--outline" onClick={() => void load()}>
            <RefreshIcon size={18} />
            {t.refresh}
          </button>
        )}
        <Link className="btn btn--primary" href={`/${locale}/${payment.status === "failed" ? "pricing" : "dashboard"}`}>
          {payment.status === "failed" ? t.toPricing : t.toDashboard}
        </Link>
      </div>
    </section>
  );
}
