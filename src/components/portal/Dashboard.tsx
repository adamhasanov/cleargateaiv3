"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { AccountState } from "@/lib/billing/account";
import { api, errorText } from "@/lib/client/http";
import { formatDate } from "@/lib/client/format";
import type { CheckRecord } from "@/lib/server/checks";
import { AppShell } from "../check/AppShell";
import { ArrowRightIcon, ChatIcon, FileIcon, PlusIcon } from "../Icons";
import { RequireUser } from "./RequireUser";

interface Summary {
  account: AccountState;
  totals: { total: number; completed: number };
}

export function Dashboard() {
  return (
    <AppShell>
      <RequireUser>{(me) => <DashboardBody name={me.name || me.email} />}</RequireUser>
    </AppShell>
  );
}

function DashboardBody({ name }: { name: string }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.dashboard;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checks, setChecks] = useState<CheckRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api<Summary>("/api/account/summary"), api<{ checks: CheckRecord[] }>("/api/checks")]).then(([s, c]) => {
      if (!alive) return;
      if (!s.ok || !c.ok) {
        setError(errorText(dict.portal.errors, !s.ok ? s.error : !c.ok ? c.error : "generic"));
        return;
      }
      setSummary(s.data);
      setChecks(c.data.checks);
    });
    return () => {
      alive = false;
    };
  }, [dict.portal.errors]);

  if (error) return <p className="form-message form-message--error" role="alert">{error}</p>;
  if (!summary || !checks) return <p className="portal-loading" role="status">{t.loading}</p>;

  const { account, totals } = summary;
  const { usage, plan } = account;

  return (
    <section aria-labelledby="dash-title">
      <div className="page-head">
        <div>
          <h1 id="dash-title" className="page-title">{format(t.greeting, { name })}</h1>
          <p className="page-subtitle">{t.subtitle}</p>
        </div>
        <Link className="btn btn--primary" href={`/${locale}/check`}>
          <PlusIcon size={18} />
          {t.newCheck}
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat"><span className="stat__label">{t.statTotal}</span><span className="stat__value">{totals.total}</span></div>
        <div className="stat">
          <span className="stat__label">{t.statUsed}</span>
          <span className="stat__value">{usage.used}<small> / {usage.limit ?? "∞"}</small></span>
          {usage.limit !== null && (
            <span className="meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (usage.used / Math.max(usage.limit, 1)) * 100)}%` }} /></span>
          )}
        </div>
        <div className="stat"><span className="stat__label">{t.statRemaining}</span><span className="stat__value">{usage.remaining ?? t.unlimited}</span></div>
        <div className="stat"><span className="stat__label">{t.statCredits}</span><span className="stat__value">{account.credits}</span></div>
      </div>

      <div className="dash-cards">
        <div className="panel">
          <p className="panel__eyebrow">{t.planCard}</p>
          <p className="panel__title">{dict.portal.plans.names[plan.code]}</p>
          <p className="panel__text">
            {account.subscription
              ? format(account.subscription.cancelAtPeriodEnd ? dict.portal.account.endsOn : dict.portal.account.activeUntil, { date: formatDate(account.subscription.currentPeriodEnd, locale) })
              : plan.checkLimitPeriod === "once"
                ? t.freeOnce
                : format(t.periodEnds, { date: formatDate(new Date(new Date(account.period.end).getTime() - 1), locale) })}
          </p>
          <Link className="btn btn--outline btn--sm" href={`/${locale}/pricing`}>{t.changePlan}</Link>
        </div>
        <div className="panel">
          <p className="panel__eyebrow">{t.advisorCard}</p>
          <p className="panel__text">{t.advisorCardText}</p>
          <Link className="btn btn--outline btn--sm" href={`/${locale}/${plan.advisorAccess ? "advisor" : "pricing"}`}>
            <ChatIcon size={16} />
            {plan.advisorAccess ? t.openAdvisor : dict.portal.advisor.notInPlanTitle}
          </Link>
        </div>
      </div>

      <h2 className="section-title">{t.recentTitle}</h2>
      {plan.historyDays !== null && <p className="fine-print">{format(t.historyNote, { days: plan.historyDays })}</p>}
      {checks.length === 0 ? (
        <div className="portal-empty portal-empty--inline">
          <FileIcon size={28} />
          <p>{t.empty}</p>
          <Link className="btn btn--primary btn--sm" href={`/${locale}/check`}>{t.emptyCta}</Link>
        </div>
      ) : (
        <ul className="check-list">
          {checks.map((c) => (
            <li key={c.id}>
              <Link className="check-row" href={`/${locale}/checks/${c.id}`}>
                <span className="check-row__date">{formatDate(c.createdAt, locale, true)}</span>
                <span className="check-row__docs">{Object.values(c.documentNames).join(" · ")}</span>
                <span className="check-row__result">
                  {c.status === "completed" && c.result
                    ? format(dict.results.summary[c.result.resultClass].title, { count: c.result.comparisons.filter((x) => x.status === "mismatch").length })
                    : c.status === "processing" ? t.statusProcessing : t.statusFailed}
                </span>
                <span className="check-row__risk">
                  {c.risk ? <span className={`risk-badge risk-badge--${c.risk.level}`}>{c.risk.score} · {dict.portal.risk.levels[c.risk.level]}</span> : "—"}
                </span>
                <ArrowRightIcon size={16} className="check-row__go" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
