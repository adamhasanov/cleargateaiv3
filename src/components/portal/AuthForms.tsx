"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { signIn } from "@/lib/client/demo";
import { InfoIcon } from "../Icons";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { Logo } from "../Logo";
import { GuestButton } from "./GuestButton";

/**
 * FAKE sign in / sign up (MVP simulation). Nothing is sent to a server, stored
 * in a database or verified: any e-mail and password are accepted, and the
 * "account" exists only in this browser.
 */

/** Only same-site paths are allowed as a post-login destination (no open redirect). */
function safeNext(next: string | null, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const { locale, dict } = useI18n();
  return (
    <div className="auth">
      <header className="app-header">
        <Logo locale={locale} />
        <LanguageSwitcher />
      </header>
      <main className="auth__main">
        <section className="auth__card" aria-labelledby="auth-title">
          <h1 id="auth-title" className="auth__title">{title}</h1>
          <p className="auth__subtitle">{subtitle}</p>
          {children}
          <p className="fine-print auth__demo">
            <InfoIcon size={16} />
            {dict.portal.auth.demoNote}
          </p>
        </section>
        {footer && <div className="auth__footer">{footer}</div>}
      </main>
    </div>
  );
}

function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" {...input} />
    </label>
  );
}

export function LoginForm() {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const router = useRouter();
  const nextParam = useSearchParams().get("next");
  const next = safeNext(nextParam, `/${locale}/dashboard`);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    signIn({ email: String(new FormData(e.currentTarget).get("email")), locale });
    router.replace(next);
  }

  return (
    <AuthShell
      title={t.loginTitle}
      subtitle={t.loginSubtitle}
      footer={<Link href={`/${locale}/register${nextParam ? `?next=${encodeURIComponent(next)}` : ""}`}>{t.toRegister}</Link>}
    >
      <form className="form" onSubmit={submit}>
        <Field label={t.email} name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label={t.password} name="password" type="password" autoComplete="current-password" required maxLength={128} />
        <button className="btn btn--primary btn--block" type="submit">{t.loginCta}</button>
      </form>
      <GuestButton next={nextParam ? next : undefined} />
    </AuthShell>
  );
}

export function RegisterForm() {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const router = useRouter();
  const nextParam = useSearchParams().get("next");
  const next = safeNext(nextParam, `/${locale}/dashboard`);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    signIn({ email: String(form.get("email")), name: String(form.get("name") ?? ""), locale });
    router.replace(next);
  }

  return (
    <AuthShell title={t.registerTitle} subtitle={t.registerSubtitleDemo} footer={<Link href={`/${locale}/login`}>{t.toLogin}</Link>}>
      <form className="form" onSubmit={submit}>
        <Field label={t.nameOptional} name="name" autoComplete="name" maxLength={120} />
        <Field label={t.email} name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label={t.password} name="password" type="password" autoComplete="new-password" required maxLength={128} />
        <button className="btn btn--primary btn--block" type="submit">{t.registerCta}</button>
      </form>
      <GuestButton next={nextParam ? next : undefined} />
    </AuthShell>
  );
}
