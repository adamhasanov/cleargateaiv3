"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { resetDemoData, updateProfile, useDemoAccount, type Me } from "@/lib/client/demo";
import { AppShell } from "../check/AppShell";
import { AlertCircleIcon, CheckCircleIcon, InfoIcon } from "../Icons";
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

function AccountBody({ me }: { me: Me }) {
  const { locale, dict } = useI18n();
  const t = dict.portal.account;
  const demo = useDemoAccount();
  const [profileMsg, setProfileMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    updateProfile({ name: String(f.get("name") ?? "").trim().slice(0, 120), locale: f.get("locale") === "ru" || f.get("locale") === "en" ? (f.get("locale") as "ru" | "en") : "az" });
    setProfileMsg({ tone: "success", text: t.saved });
  }

  function reset() {
    if (!window.confirm(t.demoResetConfirm)) return;
    resetDemoData();
    setResetMsg(t.demoResetDone);
  }

  return (
    <section aria-labelledby="account-title">
      <h1 id="account-title" className="page-title">{t.title}</h1>
      <p className="notice notice--warning" role="note"><InfoIcon size={20} /><span>{dict.portal.auth.demoNote}</span></p>

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
          <button className="btn btn--primary" type="submit">{t.save}</button>
        </form>

        <div className="panel">
          <h2 className="panel__title">{t.subscription}</h2>
          {!demo ? (
            <p className="portal-loading">{dict.portal.common.loading}</p>
          ) : (
            <>
              <p className="panel__text">
                <strong>{dict.portal.plans.names[demo.plan.code]}</strong>
                {demo.plan.code === "free" ? ` — ${t.freePlanNote}` : ""}
              </p>
              <p className="fine-print">{t.demoPlanNote}</p>
              <div className="portal-actions">
                <Link className="btn btn--primary btn--sm" href={`/${locale}/pricing`}>{t.upgrade}</Link>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <h2 className="panel__title">{t.demoResetTitle}</h2>
        <p className="panel__text">{t.demoResetText}</p>
        {resetMsg && <Msg tone="success" text={resetMsg} />}
        <button type="button" className="btn btn--outline btn--sm" onClick={reset}>{t.demoReset}</button>
      </div>
    </section>
  );
}
