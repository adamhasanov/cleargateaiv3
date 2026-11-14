"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import type { AccountState } from "@/lib/billing/account";
import { api, errorText } from "@/lib/client/http";
import { formatDate, formatMoney } from "@/lib/client/format";
import { setMe, type Me } from "@/lib/client/session";
import type { PaymentRecord } from "@/lib/payments/service";
import { PASSWORD_MIN } from "@/lib/validation";
import { AppShell } from "../check/AppShell";
import { AlertCircleIcon, CheckCircleIcon } from "../Icons";
import { RequireUser } from "./RequireUser";

export function Account() {
  return (
    <AppShell>
      <RequireUser>{(me) => <AccountBody me={me} />}</RequireUser>
    </AppShell>
  );
}

function Msg({ tone, text }: { tone: "error" | "success"; text: string }) {
  return (
    <p className={`form-message form-message--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <AlertCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
      <span>{text}</span>
    </p>
  );
}

export function PaymentHistory({ payments }: { payments: PaymentRecord[] }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.payments;
  if (payments.length === 0) return <p className="fine-print">{t.empty}</p>;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr><th scope="col">{t.colDate}</th><th scope="col">{t.colItem}</th><th scope="col">{t.colAmount}</th><th scope="col">{t.colStatus}</th></tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.createdAt, locale, true)}</td>
              <td>
                {p.purpose === "check_credit"
                  ? t.itemCredit
                  : format(t.itemPlan, { plan: dict.portal.plans.names[p.planCode!], period: p.billingPeriod === "annual" ? dict.portal.plans.annual : dict.portal.plans.monthly })}
              </td>
              <td>{formatMoney(p.amountMinor, p.currency, locale)}</td>
              <td>
                <Link href={`/${locale}/payments/${p.id}`} className={`pay-status pay-status--${p.status}`}>{t.status[p.status]}</Link>
                {p.status === "failed" && p.failureReason && <span className="pay-reason">{format(t.reason, { reason: p.failureReason })}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountBody({ me }: { me: Me }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.account;
  const [account, setAccount] = useState<AccountState | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [profileMsg, setProfileMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [subMsg, setSubMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api<{ account: AccountState }>("/api/account/summary"), api<{ payments: PaymentRecord[] }>("/api/payments")]).then(([s, p]) => {
      if (!alive) return;
      if (s.ok) setAccount(s.data.account);
      if (p.ok) setPayments(p.data.payments);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("profile");
    const r = await api<{ user: Me }>("/api/account/profile", { method: "PATCH", body: { name: f.get("name"), locale: f.get("locale") } });
    setBusy(null);
    if (r.ok) {
      setMe(r.data.user);
      setProfileMsg({ tone: "success", text: t.saved });
    } else setProfileMsg({ tone: "error", text: errorText(dict.portal.errors, r.error) });
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy("pw");
    const r = await api("/api/account/password", { body: { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") } });
    setBusy(null);
    if (r.ok) {
      form.reset();
      setPwMsg({ tone: "success", text: t.passwordChanged });
    } else setPwMsg({ tone: "error", text: errorText(dict.portal.errors, r.error) });
  }

  async function subscription(action: "cancel" | "resume") {
    setBusy("sub");
    setSubMsg(null);
    const r = await api<{ account: AccountState }>("/api/subscription", { body: { action } });
    setBusy(null);
    if (r.ok) setAccount(r.data.account);
    else setSubMsg(errorText(dict.portal.errors, r.error));
  }

  const sub = account?.subscription;

  return (
    <section aria-labelledby="account-title">
      <h1 id="account-title" className="page-title">{t.title}</h1>

      <div className="account-grid">
        <form className="panel form" onSubmit={saveProfile}>
          <h2 className="panel__title">{t.profile}</h2>
          <label className="field"><span className="field__label">{t.email}</span><input className="field__input" value={me.email} readOnly /></label>
          <label className="field"><span className="field__label">{dict.portal.auth.name}</span><input className="field__input" name="name" defaultValue={me.name} maxLength={120} autoComplete="name" /></label>
          <label className="field">
            <span className="field__label">{t.language}</span>
            <select className="field__input" name="locale" defaultValue={me.locale}>
              <option value="az">Azərbaycan</option><option value="ru">Русский</option><option value="en">English</option>
            </select>
          </label>
          {profileMsg && <Msg {...profileMsg} />}
          <button className="btn btn--primary" type="submit" disabled={busy === "profile"}>{t.save}</button>
        </form>

        <form className="panel form" onSubmit={changePassword}>
          <h2 className="panel__title">{t.changePassword}</h2>
          <label className="field"><span className="field__label">{t.currentPassword}</span><input className="field__input" name="currentPassword" type="password" required autoComplete="current-password" maxLength={128} /></label>
          <label className="field">
            <span className="field__label">{dict.portal.auth.newPassword}</span>
            <input className="field__input" name="newPassword" type="password" required minLength={PASSWORD_MIN} maxLength={128} autoComplete="new-password" />
            <span className="field__hint">{format(dict.portal.auth.passwordHint, { min: PASSWORD_MIN })}</span>
          </label>
          {pwMsg && <Msg {...pwMsg} />}
          <button className="btn btn--primary" type="submit" disabled={busy === "pw"}>{t.changePassword}</button>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel__title">{t.subscription}</h2>
        {!account ? (
          <p className="portal-loading">{dict.portal.common.loading}</p>
        ) : sub ? (
          <>
            <p className="panel__text">
              <strong>{dict.portal.plans.names[sub.planCode]}</strong> · {sub.billingPeriod === "annual" ? dict.portal.plans.annual : dict.portal.plans.monthly}
              {" — "}
              {format(sub.cancelAtPeriodEnd ? t.endsOn : t.activeUntil, { date: formatDate(sub.currentPeriodEnd, locale) })}
            </p>
            <p className="fine-print">{t.renewNote}</p>
            <div className="portal-actions">
              <Link className="btn btn--primary btn--sm" href={`/${locale}/pricing`}>{dict.portal.plans.renew} / {t.upgrade}</Link>
              <button type="button" className="btn btn--outline btn--sm" disabled={busy === "sub"} onClick={() => subscription(sub.cancelAtPeriodEnd ? "resume" : "cancel")}>
                {sub.cancelAtPeriodEnd ? t.resume : t.cancel}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="panel__text">{t.freePlanNote}</p>
            <Link className="btn btn--primary btn--sm" href={`/${locale}/pricing`}>{t.upgrade}</Link>
          </>
        )}
        {subMsg && <Msg tone="error" text={subMsg} />}
      </div>

      <div className="panel">
        <h2 className="panel__title">{dict.portal.payments.history}</h2>
        {payments ? <PaymentHistory payments={payments} /> : <p className="portal-loading">{dict.portal.common.loading}</p>}
      </div>
    </section>
  );
}
