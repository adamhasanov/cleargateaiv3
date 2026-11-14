"use client";

import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { RiskReason, RiskScore } from "@/lib/engine/risk";
import { GaugeIcon } from "../Icons";

/** Shipment Risk Score: number, level, every rule that added points, and the written method. */
export function RiskPanel({ risk }: { risk: RiskScore | null }) {
  const { dict } = useI18n();
  const t = dict.portal.risk;

  if (!risk) {
    return (
      <section className="risk risk--none" aria-label={t.title}>
        <GaugeIcon size={22} />
        <p>{t.notInPlan}</p>
      </section>
    );
  }

  const reasonText = (r: RiskReason): string => {
    switch (r.code) {
      case "mismatch":
        return format(t.reason.mismatch, { field: dict.fields[r.field], severity: t.severity[r.severity] });
      case "unreadableDocument":
        return format(t.reason.unreadableDocument, { document: dict.documents[r.document] });
      case "notComparable":
        return format(t.reason.notComparable, { field: dict.fields[r.field] });
      case "uncertainValues":
        return format(t.reason.uncertainValues, { field: dict.fields[r.field] });
      case "missingValue":
        return format(t.reason.missingValue, { field: dict.fields[r.field], documents: r.documents.map((d) => dict.documents[d]).join(", ") });
    }
  };

  return (
    <section className={`risk risk--${risk.level}`} aria-labelledby="risk-title">
      <div className="risk__head">
        <div>
          <h2 id="risk-title" className="risk__title">
            <GaugeIcon size={20} />
            {t.title}
          </h2>
          <p className="risk__meaning">{t.meaning}</p>
        </div>
        <p className="risk__score" aria-label={`${risk.score} ${t.outOf} — ${t.levels[risk.level]}`}>
          <span className="risk__number">{risk.score}</span>
          <span className="risk__outof">{t.outOf}</span>
          <span className="risk__level">{t.levels[risk.level]}</span>
        </p>
      </div>
      <div className="risk__bar" aria-hidden="true">
        <span style={{ width: `${risk.score}%` }} />
      </div>
      <h3 className="risk__subtitle">{t.reasons}</h3>
      {risk.reasons.length === 0 ? (
        <p className="risk__empty">{t.noReasons}</p>
      ) : (
        <ul className="risk__reasons">
          {risk.reasons.map((r, i) => (
            <li key={i}>
              <span>{reasonText(r)}</span>
              <span className="risk__points">+{r.points}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="risk__method">
        <summary>{risk.version}</summary>
        <p>{t.method}</p>
      </details>
    </section>
  );
}
