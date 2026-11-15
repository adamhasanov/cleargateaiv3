"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { extractDocument, fetchExtractionConfigured, type ApiErrorCode } from "@/lib/client/api";
import { errorText } from "@/lib/client/http";
import { newId, updateDemoData, useDemoAccount, useMe, type DemoCheck } from "@/lib/client/demo";
import { runCheck } from "@/lib/engine/compare";
import { computeRiskScore } from "@/lib/engine/risk";
import { DOCUMENT_IDS, type CheckResult, type DocumentExtraction, type DocumentId } from "@/lib/engine/types";
import { SAMPLE_EXTRACTIONS } from "@/lib/sample";
import { AlertIcon, ArrowRightIcon, CardIcon, ChatIcon, GridIcon, UserIcon } from "../Icons";
import { GuestButton } from "../portal/GuestButton";
import { RiskPanel } from "../portal/RiskPanel";
import { AppShell } from "./AppShell";
import { ProcessingView, type DocStatus, type Stage } from "./ProcessingView";
import { ResultsView } from "./ResultsView";
import { UploadView, type Slots } from "./UploadView";

const SAMPLE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SAMPLE_DEMO === "true";

type Phase = "upload" | "processing" | "result";

const emptySlots = (): Slots => ({ invoice: null, packingList: null, customsDocument: null });
const allStatus = (s: DocStatus): Record<DocumentId, DocStatus> => ({ invoice: s, packingList: s, customsDocument: s });

/**
 * M-03 check orchestration (MVP demo, no accounts or database):
 * simulated plan limit (browser only) → read each document through the stateless
 * /api/extract → compare and score in the browser → keep the values in this
 * browser's demo history. Files live only in this component's memory.
 */
export function CheckFlow() {
  const me = useMe();
  const { locale, dict } = useI18n();
  const p = dict.portal;
  const [phase, setPhase] = useState<Phase>("upload");
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const demo = useDemoAccount();
  const [stage, setStage] = useState<Stage>("extracting");
  const [docStatus, setDocStatus] = useState<Record<DocumentId, DocStatus>>(allStatus("waiting"));
  const [docErrors, setDocErrors] = useState<Partial<Record<DocumentId, ApiErrorCode>>>({});
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<DemoCheck | null>(null);
  const [sampleResult, setSampleResult] = useState<CheckResult | null>(null);
  const [blocker, setBlocker] = useState<null | "limitReached" | string>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    fetchExtractionConfigured().then((c) => alive && setConfigured(c));
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, []);

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

    // 1. Simulated plan limit (browser only).
    if (!demo || demo.funding === null) {
      setBlocker("limitReached");
      return;
    }
    const fundedByCredit = demo.funding === "credit";

    setPhase("processing");
    setFailed(false);
    setSaved(null);
    setSampleResult(null);
    setDocErrors({});
    setStage("extracting");
    setDocStatus(allStatus("processing"));

    // 2. Read each document (stateless: nothing is stored on the server).
    let anyFailed = false;
    const extractions: DocumentExtraction[] = [];
    try {
      await Promise.all(
        DOCUMENT_IDS.map(async (doc) => {
          const res = await extractDocument(doc, files[doc]!, controller.signal);
          if (res.ok) {
            extractions.push(res.extraction);
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
      // FG-03: no partial result, and a failed check is not counted.
      setFailed(true);
      return;
    }

    // 3. Compare and score in the browser, then keep the values in the demo history.
    setStage("checking");
    const result = runCheck(extractions);
    const check: DemoCheck = {
      id: newId(),
      createdAt: new Date().toISOString(),
      documentNames: { invoice: files.invoice!.name, packingList: files.packingList!.name, customsDocument: files.customsDocument!.name },
      result,
      risk: demo.plan.riskScoreAccess ? computeRiskScore(result) : null,
      extractions,
    };
    updateDemoData((d) => ({ ...d, credits: fundedByCredit ? d.credits - 1 : d.credits, checks: [check, ...d.checks] }));
    setStage("done");
    setSaved(check);
    setPhase("result");
  }, [slots, demo]);

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

  /** Simulated purchase: no payment happens, a single-check credit is just added in this browser. */
  const buySingleCheck = useCallback(() => {
    updateDemoData((d) => ({ ...d, credits: d.credits + 1 }));
    setBlocker(null);
  }, []);

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

  const usage = demo?.usage;
  const once = demo?.plan.checkLimitPeriod === "once";
  const usageLine = !demo
    ? null
    : usage!.limit === null
      ? p.flow.usageUnlimited
      : format(once ? p.flow.usageOnce : p.flow.usage, { remaining: usage!.remaining ?? 0, limit: usage!.limit });

  return (
    <AppShell lockLanguage={phase === "processing" && !failed}>
      {phase === "upload" && (
        <>
          {usageLine && (
            <p className="usage-line" role="status">
              {usageLine}
              {demo!.credits > 0 && <span> {format(p.flow.credits, { count: demo!.credits })}</span>}
            </p>
          )}
          {blocker && (
            <div className="notice notice--warning limit-panel" role="alert">
              <AlertIcon size={22} />
              <div>
                {blocker === "limitReached" ? (
                  <>
                    <p className="notice__title">{once ? p.flow.limitTitleOnce : p.flow.limitTitle}</p>
                    {usage?.limit !== null && usage && <p>{format(p.flow.limitText, { used: usage.used, limit: usage.limit ?? 0 })}</p>}
                    <div className="portal-actions">
                      <button type="button" className="btn btn--primary btn--sm" onClick={buySingleCheck}>
                        <CardIcon size={16} />
                        {p.flow.buyCheck}
                      </button>
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
                {demo?.plan.advisorAccess ? (
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
