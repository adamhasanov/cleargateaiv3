"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { AccountState } from "@/lib/billing/account";
import { getPlans, type BillingPeriod, type Plan } from "@/lib/billing/plans";
import { api, errorText, newIdempotencyKey } from "@/lib/client/http";
import { formatMoney } from "@/lib/client/format";
import { useMe } from "@/lib/client/session";
import { AppShell } from "../check/AppShell";
import { AlertCircleIcon, CheckIcon, InfoIcon, XIcon } from "../Icons";

interface Catalogue {
  plans: Plan[];
  singleCheckPriceMinor: number | null;
  paymentsConfigured: boolean;
}

export function Pricing() {
  const me = useMe();
  const { locale, dict } = useI18n();
  const t = dict.portal.plans;
  const router = useRouter();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Catalogue>("/api/plans").then((r) => r.ok && setCatalogue(r.data));
  }, []);
  useEffect(() => {
    if (me) api<{ account: AccountState }>("/api/account/summary").then((r) => r.ok && setAccount(r.data.account));
  }, [me]);

  // Until the catalogue arrives, show the plan structure without prices.
  const plans = catalogue?.plans ?? getPlans({});
  const currentCode = account?.plan.code ?? null;
  const paymentsOn = catalogue?.paymentsConfigured ?? false;
  const summary = catalogue;

  async function buy(item: { purpose: "check_credit" } | { purpose: "subscription"; planCode: string; billingPeriod: BillingPeriod }, key: string) {
    setBusy(key);
    setError(null);
    const r = await api<{ checkoutUrl: string | null; payment: { id: string; status: string } }>("/api/payments", {
      body: { idempotencyKey: newIdempotencyKey(), language: locale, item },
    });
    if (r.ok && r.data.checkoutUrl) {
      window.location.assign(r.data.checkoutUrl);
      return;
    }
    if (r.ok) {
      router.push(`/${locale}/payments/${r.data.payment.id}`);
      return;
    }
    setBusy(null);
    setError(errorText(dict.portal.errors, r.error));
  }

  const feature = (on: boolean, text: string) => (
    <li className={on ? "plan__feature" : "plan__feature plan__feature--off"}>
      {on ? <CheckIcon size={16} /> : <XIcon size={16} />}
      {text}
    </li>
  );

  return (
    <AppShell>
      <section aria-labelledby="pricing-title">
        <div className="page-head">
          <div>
            <h1 id="pricing-title" className="page-title">{t.title}</h1>
            <p className="page-subtitle">{t.subtitle}</p>
          </div>
          <div className="segmented" role="radiogroup" aria-label={`${t.monthly} / ${t.annual}`}>
            {(["monthly", "annual"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "segmented__on" : ""} onClick={() => setPeriod(p)}>
                {p === "monthly" ? t.monthly : t.annual}
              </button>
            ))}
          </div>
        </div>

        {me && summary && !paymentsOn && (
          <p className="notice notice--warning" role="status"><InfoIcon size={20} /><span>{t.paymentsOff}</span></p>
        )}
        {error && <p className="form-message form-message--error" role="alert"><AlertCircleIcon size={18} /><span>{error}</span></p>}

        <div className="plan-grid">
          {plans.map((plan) => {
            // Starter is paid per document (the single-check price); the others per month / year.
            const perDocument = plan.code === "starter";
            const price = plan.code === "free" ? null : perDocument ? catalogue?.singleCheckPriceMinor ?? null : period === "monthly" ? plan.priceMonthlyMinor : plan.priceAnnualMinor;
            const isCurrent = plan.code === currentCode;
            const key = perDocument ? "single" : `${plan.code}-${period}`;
            return (
              <article key={plan.code} className={`plan ${isCurrent ? "plan--current" : ""}`} aria-labelledby={`plan-${plan.code}`}>
                <h2 id={`plan-${plan.code}`} className="plan__name">{t.names[plan.code]}</h2>
                <p className="plan__price">
                  {plan.code === "free" ? t.free : !catalogue ? <small aria-busy="true">—</small> : price ? <>{formatMoney(price, plan.currency, locale)} <small>{perDocument ? t.perDocument : period === "monthly" ? t.perMonth : t.perYear}</small></> : <small>{t.priceNotSet}</small>}
                </p>
                <ul className="plan__features">
                  {feature(true, plan.monthlyCheckLimit === null ? t.features.checksUnlimited : format(plan.checkLimitPeriod === "once" ? t.features.checksOnce : t.features.checks, { count: plan.monthlyCheckLimit }))}
                  {feature(plan.riskScoreAccess, plan.riskScoreAccess ? t.features.risk : t.features.noRisk)}
                  {feature(plan.advisorAccess, plan.advisorAccess ? t.features.advisor : t.features.noAdvisor)}
                  {feature(true, plan.historyDays === null ? t.features.historyAll : format(t.features.history, { days: plan.historyDays }))}
                  {feature(plan.advancedReports, plan.advancedReports ? t.features.reports : t.features.noReports)}
                  {feature(true, plan.maxUsers === 1 ? t.features.oneUser : format(t.features.users, { count: plan.maxUsers }))}
                  {feature(true, t.features.support[plan.supportLevel])}
                </ul>
                <div className="plan__action">
                  {isCurrent && plan.code === "free" ? (
                    <span className="plan__current">{t.current}</span>
                  ) : plan.code === "free" ? null : !me ? (
                    <Link className="btn btn--outline btn--block" href={`/${locale}/login?next=/${locale}/pricing`}>{t.loginToBuy}</Link>
                  ) : (
                    <>
                      {isCurrent && <span className="plan__current">{t.current}</span>}
                      <button
                        type="button"
                        className={`btn btn--block ${isCurrent ? "btn--outline" : "btn--primary"}`}
                        disabled={!paymentsOn || !price || busy !== null}
                        onClick={() => (perDocument ? buy({ purpose: "check_credit" }, key) : buy({ purpose: "subscription", planCode: plan.code, billingPeriod: period }, key))}
                      >
                        {busy === key ? dict.portal.payments.redirecting : perDocument ? t.singleCta : isCurrent ? t.renew : t.choose}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="panel single-check">
          <div>
            <p className="panel__title">{t.singleTitle}</p>
            <p className="panel__text">
              {t.singleText}{" "}
              {summary?.singleCheckPriceMinor ? <strong>{formatMoney(summary.singleCheckPriceMinor, "AZN", locale)}</strong> : me ? t.priceNotSet : null}
            </p>
          </div>
          {me ? (
            <button type="button" className="btn btn--outline" disabled={!paymentsOn || !summary?.singleCheckPriceMinor || busy !== null} onClick={() => buy({ purpose: "check_credit" }, "single")}>
              {busy === "single" ? dict.portal.payments.redirecting : t.singleCta}
            </button>
          ) : (
            <Link className="btn btn--outline" href={`/${locale}/login?next=/${locale}/pricing`}>{t.loginToBuy}</Link>
          )}
        </div>

        <p className="fine-print"><InfoIcon size={16} />{t.disclaimer}</p>
        <p className="fine-print"><InfoIcon size={16} />{t.usersNote}</p>
      </section>
    </AppShell>
  );
}
