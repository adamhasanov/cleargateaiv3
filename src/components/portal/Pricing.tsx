"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { SINGLE_CHECK_PRICE_MINOR, getPlans, type BillingPeriod, type Plan } from "@/lib/billing/plans";
import { updateDemoData, useDemoAccount, useMe } from "@/lib/client/demo";
import { formatMoney } from "@/lib/client/format";
import { AppShell } from "../check/AppShell";
import { CheckCircleIcon, CheckIcon, InfoIcon, XIcon } from "../Icons";

export function Pricing() {
  const me = useMe();
  const { locale, dict } = useI18n();
  const t = dict.portal.plans;
  const demo = useDemoAccount();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [notice, setNotice] = useState<string | null>(null);

  const plans = getPlans();
  const currentCode = demo?.plan.code ?? null;

  /** Simulated purchase: nothing is charged; the choice is stored in this browser only. */
  function pick(plan: Plan, perDocument: boolean) {
    if (perDocument) updateDemoData((d) => ({ ...d, credits: d.credits + 1 }));
    else updateDemoData((d) => ({ ...d, plan: plan.code }));
    setNotice(perDocument ? t.demoCreditAdded : format(t.demoPlanSet, { plan: t.names[plan.code] }));
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

        <p className="notice notice--warning" role="status"><InfoIcon size={20} /><span>{t.demoNote}</span></p>
        {notice && <p className="form-message form-message--success" role="status"><CheckCircleIcon size={18} /><span>{notice}</span></p>}

        <div className="plan-grid">
          {plans.map((plan) => {
            // Starter is paid per document (the single-check price); the others per month / year.
            const perDocument = plan.code === "starter";
            const price = plan.code === "free" ? null : perDocument ? SINGLE_CHECK_PRICE_MINOR : period === "monthly" ? plan.priceMonthlyMinor : plan.priceAnnualMinor;
            const isCurrent = plan.code === currentCode;
            return (
              <article key={plan.code} className={`plan ${isCurrent ? "plan--current" : ""}`} aria-labelledby={`plan-${plan.code}`}>
                <h2 id={`plan-${plan.code}`} className="plan__name">{t.names[plan.code]}</h2>
                <p className="plan__price">
                  {plan.code === "free" ? t.free : price ? <>{formatMoney(price, plan.currency, locale)} <small>{perDocument ? t.perDocument : period === "monthly" ? t.perMonth : t.perYear}</small></> : <small>{t.priceNotSet}</small>}
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
                        disabled={!price}
                        onClick={() => pick(plan, perDocument)}
                      >
                        {perDocument ? t.singleCta : isCurrent ? t.renew : t.choose}
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
              <strong>{formatMoney(SINGLE_CHECK_PRICE_MINOR, "AZN", locale)}</strong>
            </p>
          </div>
          {me ? (
            <button type="button" className="btn btn--outline" onClick={() => pick(plans[1], true)}>
              {t.singleCta}
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
