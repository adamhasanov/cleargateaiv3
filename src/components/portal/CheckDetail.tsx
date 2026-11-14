"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { AccountState } from "@/lib/billing/account";
import { api, errorText } from "@/lib/client/http";
import { formatDate } from "@/lib/client/format";
import type { CheckRecord } from "@/lib/server/checks";
import { AppShell } from "../check/AppShell";
import { ResultsView } from "../check/ResultsView";
import { AlertCircleIcon, ArrowRightIcon, ChatIcon, InfoIcon, PrinterIcon } from "../Icons";
import { RequireUser } from "./RequireUser";
import { RiskPanel } from "./RiskPanel";

export function CheckDetail({ id }: { id: string }) {
  return (
    <AppShell>
      <RequireUser>{() => <Body id={id} />}</RequireUser>
    </AppShell>
  );
}

function Body({ id }: { id: string }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.checks;
  const router = useRouter();
  const [check, setCheck] = useState<CheckRecord | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<{ check: CheckRecord }>(`/api/checks/${id}`), api<{ account: AccountState }>("/api/account/summary")]).then(([c, s]) => {
      if (c.ok) setCheck(c.data.check);
      else setError(errorText(dict.portal.errors, c.error));
      if (s.ok) setAccount(s.data.account);
    });
  }, [id, dict.portal.errors]);

  if (error) {
    return (
      <div>
        <p className="form-message form-message--error" role="alert"><AlertCircleIcon size={18} /><span>{error}</span></p>
        <Link className="btn btn--outline btn--sm" href={`/${locale}/dashboard`}>{t.back}</Link>
      </div>
    );
  }
  if (!check) return <p className="portal-loading" role="status">{dict.portal.common.loading}</p>;

  const header = (
    <div className="report-head">
      <Link className="back-link no-print" href={`/${locale}/dashboard`}>← {t.back}</Link>
      <p className="print-only report-head__title">ClearGateAI — {t.reportTitle}</p>
      <p className="report-head__meta">
        {formatDate(check.completedAt ?? check.createdAt, locale, true)} · {Object.values(check.documentNames).join(" · ")}
        <span className="print-only"> · ID {check.id}</span>
      </p>
    </div>
  );

  if (check.status !== "completed" || !check.result) {
    return (
      <section>
        {header}
        <p className="notice notice--warning"><InfoIcon size={20} /><span>{check.status === "processing" ? t.processingNote : t.failedNote}</span></p>
      </section>
    );
  }

  return (
    <div className="check-detail">
      {header}
      <ResultsView
        result={check.result}
        isSample={false}
        onNewCheck={() => router.push(`/${locale}/check`)}
        afterSummary={
          <>
            <RiskPanel risk={check.risk} />
            <div className="result-actions no-print">
              {account?.plan.advisorAccess ? (
                <Link className="btn btn--primary btn--sm" href={`/${locale}/advisor?check=${check.id}`}>
                  <ChatIcon size={18} />
                  {t.askAdvisor}
                </Link>
              ) : (
                <Link className="btn btn--outline btn--sm" href={`/${locale}/pricing`}>
                  <ChatIcon size={18} />
                  {dict.portal.advisor.notInPlanTitle}
                  <ArrowRightIcon size={16} />
                </Link>
              )}
              {account?.plan.advancedReports ? (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => window.print()}>
                  <PrinterIcon size={18} />
                  {t.report}
                </button>
              ) : (
                account && <span className="fine-print">{t.reportsNotInPlan}</span>
              )}
            </div>
          </>
        }
      />
    </div>
  );
}
