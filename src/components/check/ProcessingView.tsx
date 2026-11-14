"use client";

import { useI18n } from "@/i18n/I18nProvider";
import type { ApiErrorCode } from "@/lib/client/api";
import { DOCUMENT_IDS, type DocumentId } from "@/lib/engine/types";
import { AlertCircleIcon, AlertIcon, CheckCircleIcon, CheckIcon, ClockIcon, FileIcon, RefreshIcon, Spinner, XIcon } from "../Icons";
import type { Slots } from "./UploadView";

export type DocStatus = "waiting" | "processing" | "completed" | "unreadable" | "failed";
export type Stage = "extracting" | "checking" | "done";

type StepState = "done" | "active" | "pending" | "failed";

function StepMarker({ state }: { state: StepState }) {
  return (
    <span className={`stepper__marker stepper__marker--${state}`} aria-hidden="true">
      {state === "done" && <CheckIcon size={18} />}
      {state === "active" && <Spinner size={22} />}
      {state === "failed" && <XIcon size={18} />}
    </span>
  );
}

function DocStatusBadge({ status }: { status: DocStatus }) {
  const { dict } = useI18n();
  const label = dict.processing.docStatus[status];
  const icon = {
    waiting: <ClockIcon size={18} />,
    processing: <Spinner size={18} />,
    completed: <CheckCircleIcon size={18} />,
    unreadable: <AlertIcon size={18} />,
    failed: <AlertCircleIcon size={18} />,
  }[status];
  return (
    <span className={`doc-status doc-status--${status}`}>
      {icon}
      {label}
    </span>
  );
}

export function ProcessingView({
  slots, stage, docStatus, docErrors, failed, onRetry, onBack,
}: {
  slots: Slots;
  stage: Stage;
  docStatus: Record<DocumentId, DocStatus>;
  docErrors: Partial<Record<DocumentId, ApiErrorCode>>;
  failed: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const { dict } = useI18n();
  const extractionDone = stage === "checking" || stage === "done";

  const steps: { label: string; state: StepState }[] = [
    { label: dict.processing.stages.received, state: "done" },
    { label: dict.processing.stages.extracting, state: failed ? "failed" : extractionDone ? "done" : "active" },
    { label: dict.processing.stages.checking, state: failed ? "pending" : stage === "done" ? "done" : stage === "checking" ? "active" : "pending" },
  ];

  return (
    <section aria-labelledby="processing-title">
      <h1 id="processing-title" className="page-title">{failed ? dict.processing.failedTitle : dict.processing.title}</h1>
      <p className="page-subtitle">{failed ? dict.processing.failedText : dict.processing.subtitle}</p>

      <ol className="stepper" aria-label={dict.processing.progressLabel}>
        {steps.map((s) => (
          <li key={s.label} className={`stepper__step stepper__step--${s.state}`}>
            <StepMarker state={s.state} />
            <span className="stepper__label">{s.label}</span>
          </li>
        ))}
      </ol>

      <ul className="doc-list" aria-live="polite">
        {DOCUMENT_IDS.map((doc) => (
          <li key={doc} className="doc-list__item">
            <FileIcon size={22} className="doc-list__icon" />
            <div className="doc-list__name">
              <span className="doc-list__type">{dict.documents[doc]}</span>
              <span className="doc-list__file">{slots[doc]?.name}</span>
              {docErrors[doc] && <span className="doc-list__error">{dict.errors[docErrors[doc]!]}</span>}
            </div>
            <DocStatusBadge status={docStatus[doc]} />
          </li>
        ))}
      </ul>

      {failed && (
        <div className="actions-row">
          <button type="button" className="btn btn--outline" onClick={onBack}>
            {dict.processing.backToUpload}
          </button>
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            <RefreshIcon size={18} />
            {dict.processing.retry}
          </button>
        </div>
      )}
    </section>
  );
}
