"use client";

import { Fragment, useId, useState, type ReactNode } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { CheckResult, FieldComparison, FieldId } from "@/lib/engine/types";
import { DOCUMENT_IDS } from "@/lib/engine/types";
import { displayValue, explain, joinDocs } from "@/lib/explain";
import {
  AlertCircleIcon, AlertIcon, BoxIcon, CheckCircleIcon, ChevronDownIcon, HashIcon, InfoIcon, RefreshIcon, TagIcon, WeightIcon,
} from "../Icons";

type Tab = "mismatches" | "matches" | "missing";

const FIELD_ICONS: Record<FieldId, typeof WeightIcon> = {
  weight: WeightIcon, quantity: BoxIcon, price: TagIcon, hsCode: HashIcon,
};

const isIncomplete = (c: FieldComparison) => c.status === "notCompared" || c.missingDocuments.length > 0;

function StatusBadge({ c }: { c: FieldComparison }) {
  const { dict } = useI18n();
  if (c.status === "mismatch") return <span className="badge badge--error">{dict.results.status.mismatch}</span>;
  if (c.status === "notCompared") return <span className="badge badge--warning">{dict.results.status.notCompared}</span>;
  if (c.missingDocuments.length > 0) return <span className="badge badge--warning">{dict.results.status.missing}</span>;
  return <span className="badge badge--success">{dict.results.status.match}</span>;
}

function ComparisonRow({ c }: { c: FieldComparison }) {
  const { dict, locale } = useI18n();
  const [open, setOpen] = useState(c.status === "mismatch");
  const detailId = useId();
  const Icon = FIELD_ICONS[c.field];
  const { explanation, fix } = explain(c, dict, locale);

  return (
    <Fragment>
      <tr className={`cmp-row cmp-row--${c.status}`}>
        <th scope="row" className="cmp-row__field">
          <Icon size={20} />
          {dict.fields[c.field]}
        </th>
        {DOCUMENT_IDS.map((doc) => {
          const entry = c.values.find((e) => e.document === doc)!;
          const hasValue = entry.outcome.status === "value";
          return (
            <td key={doc} className="cmp-row__value" data-label={dict.documents[doc]}>
              <span className={hasValue ? (c.status === "mismatch" && c.comparedDocuments.includes(doc) ? "value value--diff" : "value") : "value value--missing"}>
                {displayValue(entry, dict)}
              </span>
            </td>
          );
        })}
        <td className="cmp-row__status" data-label={dict.results.columns.status}>
          <StatusBadge c={c} />
        </td>
        <td className="cmp-row__toggle">
          <button
            type="button"
            className="icon-btn"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${open ? dict.results.hideDetails : dict.results.details}: ${dict.fields[c.field]}`}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDownIcon size={20} className={open ? "rotate" : undefined} />
          </button>
        </td>
      </tr>
      <tr className="cmp-detail" id={detailId} hidden={!open}>
        <td colSpan={6}>
          <div className="cmp-detail__grid">
            <div>
              <p className="cmp-detail__label">{dict.results.explanation}</p>
              <p>{explanation}</p>
            </div>
            {fix && (
              <div>
                <p className="cmp-detail__label">{dict.results.fix}</p>
                <p>{fix}</p>
              </div>
            )}
          </div>
          <p className="cmp-detail__rule">
            {dict.results.rule}: <code>{c.ruleId}</code> {dict.rules[c.ruleId]}
          </p>
        </td>
      </tr>
    </Fragment>
  );
}

export function ResultsView({
  result, isSample, onNewCheck, afterSummary,
}: { result: CheckResult; isSample: boolean; onNewCheck: () => void; afterSummary?: ReactNode }) {
  const { dict } = useI18n();
  const mismatches = result.comparisons.filter((c) => c.status === "mismatch");
  const matches = result.comparisons.filter((c) => c.status === "match");
  const missing = result.comparisons.filter(isIncomplete);
  const [tab, setTab] = useState<Tab>(mismatches.length ? "mismatches" : missing.length ? "missing" : "matches");

  const lists: Record<Tab, FieldComparison[]> = { mismatches, matches, missing };
  const empty: Record<Tab, string> = {
    mismatches: dict.results.emptyMismatches,
    matches: dict.results.emptyMatches,
    missing: dict.results.emptyMissing,
  };
  const summary = dict.results.summary[result.resultClass];
  const tone =
    result.resultClass === "noMismatch" ? "success" : result.resultClass === "incomplete" ? "warning" : "error";
  const SummaryIcon = tone === "success" ? CheckCircleIcon : tone === "warning" ? AlertIcon : AlertCircleIcon;
  const rows = lists[tab];

  return (
    <section aria-labelledby="result-title">
      <h1 id="result-title" className="page-title">{dict.results.title}</h1>
      <p className="page-subtitle">{dict.results.subtitle}</p>

      {isSample && (
        <p className="sample-banner" role="note">
          <InfoIcon size={18} />
          {dict.results.sampleBanner}
        </p>
      )}

      <div className={`summary summary--${tone}`} role="status">
        <SummaryIcon size={28} />
        <div>
          <p className="summary__title">{format(summary.title, { count: mismatches.length })}</p>
          <p className="summary__text">{summary.text}</p>
          {result.unreadableDocuments.length > 0 && (
            <p className="summary__text">
              {format(dict.results.unreadableDocs, { docs: joinDocs(result.unreadableDocuments, dict) })}
            </p>
          )}
        </div>
      </div>

      {afterSummary}

      <div className="tabs" role="tablist" aria-label={dict.results.tabsLabel}>
        {(["mismatches", "matches", "missing"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls="result-panel"
            className={`tab tab--${t} ${tab === t ? "tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "mismatches" ? <AlertCircleIcon size={18} /> : t === "matches" ? <CheckCircleIcon size={18} /> : <InfoIcon size={18} />}
            {dict.results.tabs[t]} ({lists[t].length})
          </button>
        ))}
      </div>

      <div id="result-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="table-card">
        {rows.length === 0 ? (
          <p className="table-card__empty">{empty[tab]}</p>
        ) : (
          <table className="cmp-table">
            <thead>
              <tr>
                <th scope="col">{dict.results.columns.field}</th>
                {DOCUMENT_IDS.map((d) => (
                  <th scope="col" key={d}>{dict.documents[d]}</th>
                ))}
                <th scope="col">{dict.results.columns.status}</th>
                <th scope="col"><span className="visually-hidden">{dict.results.details}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <ComparisonRow key={`${tab}-${c.field}`} c={c} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="fine-print">
        <InfoIcon size={16} />
        {dict.results.hsNotice}
      </p>

      <div className="result-footer">
        <p className="result-footer__notice">{dict.results.outsideNotice}</p>
        <button type="button" className="btn btn--primary" onClick={onNewCheck}>
          <RefreshIcon size={18} />
          {dict.results.newCheck}
        </button>
      </div>
    </section>
  );
}
