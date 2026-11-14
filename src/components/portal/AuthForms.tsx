"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { format } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { getPlan } from "@/lib/billing/plans";
import { api, errorText } from "@/lib/client/http";
import { setMe, type Me } from "@/lib/client/session";
import { PASSWORD_MIN } from "@/lib/validation";
import { AlertCircleIcon, CheckCircleIcon } from "../Icons";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { Logo } from "../Logo";

/** Only same-site paths are allowed as a post-login destination (no open redirect). */
function safeNext(next: string | null, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const { locale } = useI18n();
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
        </section>
        {footer && <div className="auth__footer">{footer}</div>}
      </main>
    </div>
  );
}

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" {...input} />
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <p className={`form-message form-message--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <AlertCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
      <span>{children}</span>
    </p>
  );
}

export function LoginForm() {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), `/${locale}/dashboard`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api<{ user: Me }>("/api/auth/login", { body: { email: form.get("email"), password: form.get("password") } });
    if (r.ok) {
      setMe(r.data.user);
      router.replace(next);
      return;
    }
    setBusy(false);
    setError(errorText(dict.portal.errors, r.error));
  }

  return (
    <AuthShell
      title={t.loginTitle}
      subtitle={t.loginSubtitle}
      footer={<Link href={`/${locale}/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t.toRegister}</Link>}
    >
      <form className="form" onSubmit={submit} noValidate={false}>
        <Field label={t.email} name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label={t.password} name="password" type="password" autoComplete="current-password" required maxLength={128} />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>{busy ? t.working : t.loginCta}</button>
        <Link className="form__link" href={`/${locale}/forgot-password`}>{t.forgotLink}</Link>
      </form>
    </AuthShell>
  );
}

export function RegisterForm() {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), `/${locale}/dashboard`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api<{ user: Me }>("/api/auth/register", {
      body: { email: form.get("email"), password: form.get("password"), name: form.get("name") ?? "", locale },
    });
    if (r.ok) {
      setMe(r.data.user);
      router.replace(next);
      return;
    }
    setBusy(false);
    setError(errorText(dict.portal.errors, r.error));
  }

  return (
    <AuthShell
      title={t.registerTitle}
      subtitle={format(t.registerSubtitle, { count: getPlan("free")!.monthlyCheckLimit ?? 0 })}
      footer={<Link href={`/${locale}/login`}>{t.toLogin}</Link>}
    >
      <form className="form" onSubmit={submit}>
        <Field label={t.nameOptional} name="name" autoComplete="name" maxLength={120} />
        <Field label={t.email} name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label={t.password} name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={128} hint={format(t.passwordHint, { min: PASSWORD_MIN })} />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <button className="btn btn--primary btn--block" type="submit" disabled={busy}>{busy ? t.working : t.registerCta}</button>
      </form>
    </AuthShell>
  );
}

export function ForgotForm() {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/api/auth/forgot", { body: { email: new FormData(e.currentTarget).get("email"), locale } });
    setBusy(false);
    if (r.ok) setSent(true);
    else setError(errorText(dict.portal.errors, r.error));
  }

  return (
    <AuthShell title={t.forgotTitle} subtitle={t.forgotSubtitle} footer={<Link href={`/${locale}/login`}>{t.backToLogin}</Link>}>
      {sent ? (
        <FormMessage tone="success">{t.forgotSent}</FormMessage>
      ) : (
        <form className="form" onSubmit={submit}>
          <Field label={t.email} name="email" type="email" autoComplete="email" required maxLength={254} />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>{busy ? t.working : t.forgotCta}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetForm() {
  const { locale, dict } = useI18n();
  const t = dict.portal.auth;
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api("/api/auth/reset", { body: { token, password: new FormData(e.currentTarget).get("password") } });
    if (r.ok) {
      const me = await api<{ user: Me | null }>("/api/auth/me");
      setMe(me.ok ? me.data.user : null);
      router.replace(`/${locale}/dashboard`);
      return;
    }
    setBusy(false);
    setError(errorText(dict.portal.errors, r.error));
  }

  return (
    <AuthShell title={t.resetTitle} subtitle={t.resetSubtitle} footer={<Link href={`/${locale}/forgot-password`}>{t.forgotTitle}</Link>}>
      {token.length < 20 ? (
        <FormMessage tone="error">{t.resetMissingToken}</FormMessage>
      ) : (
        <form className="form" onSubmit={submit}>
          <Field label={t.newPassword} name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={128} hint={format(t.passwordHint, { min: PASSWORD_MIN })} />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <button className="btn btn--primary btn--block" type="submit" disabled={busy}>{busy ? t.working : t.resetCta}</button>
        </form>
      )}
    </AuthShell>
  );
}
