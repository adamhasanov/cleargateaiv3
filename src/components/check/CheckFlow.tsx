"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { extractDocument, fetchExtractionConfigured, type ApiErrorCode } from "@/lib/client/api";
import { api, errorText, newIdempotencyKey } from "@/lib/client/http";
import { useMe } from "@/lib/client/session";
import { runCheck } from "@/lib/engine/compare";
import type { RiskScore } from "@/lib/engine/risk";
import { DOCUMENT_IDS, type CheckResult, type DocumentId } from "@/lib/engine/types";
import { SAMPLE_EXTRACTIONS } from "@/lib/sample";
import type { AccountState } from "@/lib/billing/account";
import { AlertIcon, ArrowRightIcon, CardIcon, ChatIcon, GridIcon, UserIcon } from "../Icons";
import { GuestButton } from "../portal/GuestButton";
import { RiskPanel } from "../portal/RiskPanel";
import { AppShell } from "./AppShell";
import { ProcessingView, type DocStatus, type Stage } from "./ProcessingView";
import { ResultsView } from "./ResultsView";
import { UploadView, type Slots } from "./UploadView";

const SAMPLE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SAMPLE_DEMO === "true";

type Phase = "upload" | "processing" | "result";
interface SavedCheck {
  id: string;
  result: CheckResult;
  risk: RiskScore | null;
}

const emptySlots = (): Slots => ({ invoice: null, packingList: null, customsDocument: null });
const allStatus = (s: DocStatus): Record<DocumentId, DocStatus> => ({ invoice: s, packingList: s, customsDocument: s });

/**
 * M-03 check orchestration, now server-backed:
 * reserve a check (plan limit enforced on the server) → read each document →
 * the server compares and scores the stored values → result.
 * Files live only in this component's memory; only extracted values are saved.
 */
export function CheckFlow() {
  const me = useMe();
  const { locale, dict } = useI18n();
  const p = dict.portal;
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("upload");
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [paymentsOn, setPaymentsOn] = useState(false);
  const [stage, setStage] = useState<Stage>("extracting");
  const [docStatus, setDocStatus] = useState<Record<DocumentId, DocStatus>>(allStatus("waiting"));
  const [docErrors, setDocErrors] = useState<Partial<Record<DocumentId, ApiErrorCode>>>({});
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<SavedCheck | null>(null);
  const [sampleResult, setSampleResult] = useState<CheckResult | null>(null);
  const [blocker, setBlocker] = useState<null | "limitReached" | string>(null);
  const [buying, setBuying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSummary = () => api<{ account: AccountState; paymentsConfigured: boolean }>("/api/account/summary");
  const loadAccount = useCallback(async () => {
    const r = await fetchSummary();
    if (r.ok) {
      setAccount(r.data.account);
      setPaymentsOn(r.data.paymentsConfigured);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchExtractionConfigured().then((c) => alive && setConfigured(c));
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    fetchSummary().then((r) => {
      if (!alive || !r.ok) return;
      setAccount(r.data.account);
      setPaymentsOn(r.data.paymentsConfigured);
    });
    return () => {
      alive = false;
    };
  }, [me]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [phase]);

  const start = useCallback(async () => {
    const files = slots;
    if (!DOCUMENT_IDS.every((d) => files[d])) return; // FR-020: never start an incomplete set
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBlocker(null);

    // 1. Reserve the check (the server enforces the plan limit or uses a paid credit).
    const reserved = await api<{ check: { id: string }; account: AccountState }>("/api/checks", {
      body: { documentNames: { invoice: files.invoice!.name, packingList: files.packingList!.name, customsDocument: files.customsDocument!.name } },
    });
    if (!reserved.ok) {
      if (reserved.error === "unauthenticated") router.replace(`/${locale}/login?next=/${locale}/check`);
      setBlocker(reserved.error);
      return;
    }
    const checkId = reserved.data.check.id;
    setAccount(reserved.data.account);

    setPhase("processing");
    setFailed(false);
    setSaved(null);
    setSampleResult(null);
    setDocErrors({});
    setStage("extracting");
    setDocStatus(allStatus("processing"));

    // 2. Read each document (values are stored on the check on the server).
    let anyFailed = false;
    try {
      await Promise.all(
        DOCUMENT_IDS.map(async (doc) => {
          const res = await extractDocument(checkId, doc, files[doc]!, controller.signal);
          if (res.ok) {
            setDocStatus((s) => ({ ...s, [doc]: res.extraction.readable ? "completed" : "unreadable" }));
          } else {
            anyFailed = true;
            setDocStatus((s) => ({ ...s, [doc]: "failed" }));
            setDocErrors((e) => ({ ...e, [doc]: res.error }));
          }
        }),
      );
    } catch {
      return; // aborted: the user left or restarted
    }

    if (anyFailed) {
      // FG-03: no partial result. The check is closed and its usage returned.
      await api(`/api/checks/${checkId}/fail`, { body: {} });
      setFailed(true);
      void loadAccount();
      return;
    }

    // 3. The server compares and scores the stored values.
    setStage("checking");
    const done = await api<{ check: { id: string; result: CheckResult; risk: RiskScore | null }; account: AccountState }>(`/api/checks/${checkId}/finalize`, { body: {} });
    if (!done.ok || !done.data.check.result) {
      setFailed(true);
      return;
    }
    setAccount(done.data.account);
    setStage("done");
    setSaved({ id: done.data.check.id, result: done.data.check.result, risk: done.data.check.risk });
    setPhase("result");
  }, [slots, locale, router, loadAccount]);

  const showSample = useCallback(() => {
    setSampleResult(runCheck(SAMPLE_EXTRACTIONS));
    setSaved(null);
    setPhase("result");
  }, []);

  const newCheck = useCallback(() => {
    abortRef.current?.abort();
    setSlots(emptySlots());
    setSaved(null);
    setSampleResult(null);
    setFailed(false);
    setBlocker(null);
    setDocErrors({});
    setDocStatus(allStatus("waiting"));
    setPhase("upload");
  }, []);

  const backToUpload = useCallback(() => {
    abortRef.current?.abort();
    setFailed(false);
    setPhase("upload");
  }, []);

  const buySingleCheck = useCallback(async () => {
    setBuying(true);
    const r = await api<{ checkoutUrl: string | null; payment: { id: string } }>("/api/payments", {
      body: { idempotencyKey: newIdempotencyKey(), language: locale, item: { purpose: "check_credit" } },
    });
    if (r.ok && r.data.checkoutUrl) {
      window.location.assign(r.data.checkoutUrl);
      return;
    }
    setBuying(false);
    setBlocker(r.ok ? "paymentProviderError" : r.error);
  }, [locale]);

  // ---------- signed out ----------
  if (me === null) {
    return (
      <AppShell>
        <section className="portal-empty" aria-labelledby="signin-title">
          <UserIcon size={32} />
          <h1 id="signin-title" className="page-title">{p.flow.signInTitle}</h1>
          <p className="page-subtitle">{p.flow.signInText}</p>
          <div className="portal-actions">
            <Link className="btn btn--primary" href={`/${locale}/login?next=/${locale}/check`}>{p.nav.login}</Link>
            <Link className="btn btn--outline" href={`/${locale}/register?next=/${locale}/check`}>{p.nav.register}</Link>
          </div>
          <GuestButton />
        </section>
      </AppShell>
    );
  }

  const usage = account?.usage;
  const usageLine = !account
    ? null
    : usage!.limit === null
      ? p.flow.usageUnlimited
      : format(account.plan.checkLimitPeriod === "once" && !account.subscription ? p.flow.usageOnce : p.flow.usage, { remaining: usage!.remaining ?? 0, limit: usage!.limit });

  return (
    <AppShell lockLanguage={phase === "processing" && !failed}>
      {phase === "upload" && (
        <>
          {usageLine && (
            <p className="usage-line" role="status">
              {usageLine}
              {account!.credits > 0 && <span> {format(p.flow.credits, { count: account!.credits })}</span>}
            </p>
          )}
          {blocker && (
            <div className="notice notice--warning limit-panel" role="alert">
              <AlertIcon size={22} />
              <div>
                {blocker === "limitReached" ? (
                  <>
                    <p className="notice__title">{account?.plan.checkLimitPeriod === "once" && !account.subscription ? p.flow.limitTitleOnce : p.flow.limitTitle}</p>
                    {usage?.limit !== null && usage && <p>{format(p.flow.limitText, { used: usage.used, limit: usage.limit ?? 0 })}</p>}
                    <div className="portal-actions">
                      {paymentsOn && (
                        <button type="button" className="btn btn--primary btn--sm" onClick={buySingleCheck} disabled={buying}>
                          <CardIcon size={16} />
                          {buying ? p.payments.redirecting : p.flow.buyCheck}
                        </button>
                      )}
                      <Link className="btn btn--outline btn--sm" href={`/${locale}/pricing`}>{p.flow.upgrade}</Link>
                    </div>
                  </>
                ) : (
                  <p className="notice__title">{errorText(p.errors, blocker)}</p>
                )}
              </div>
            </div>
          )}
          <UploadView
            slots={slots}
            onChange={setSlots}
            onStart={start}
            configured={configured}
            sampleEnabled={SAMPLE_ENABLED}
            onSample={showSample}
          />
        </>
      )}
      {phase === "processing" && (
        <ProcessingView
          slots={slots}
          stage={stage}
          docStatus={docStatus}
          docErrors={docErrors}
          failed={failed}
          onRetry={start}
          onBack={backToUpload}
        />
      )}
      {phase === "result" && sampleResult && <ResultsView result={sampleResult} isSample onNewCheck={newCheck} />}
      {phase === "result" && saved && (
        <ResultsView
          result={saved.result}
          isSample={false}
          onNewCheck={newCheck}
          afterSummary={
            <>
              <RiskPanel risk={saved.risk} />
              <div className="result-actions">
                {account?.plan.advisorAccess ? (
                  <Link className="btn btn--primary btn--sm" href={`/${locale}/advisor?check=${saved.id}`}>
                    <ChatIcon size={18} />
                    {p.checks.askAdvisor}
                  </Link>
                ) : (
                  <Link className="btn btn--outline btn--sm" href={`/${locale}/pricing`}>
                    <ChatIcon size={18} />
                    {p.advisor.notInPlanTitle}
                  </Link>
                )}
                <Link className="btn btn--outline btn--sm" href={`/${locale}/checks/${saved.id}`}>
                  <GridIcon size={18} />
                  {p.flow.openInDashboard}
                  <ArrowRightIcon size={16} />
                </Link>
              </div>
            </>
          }
        />
      )}
    </AppShell>
  );
}
