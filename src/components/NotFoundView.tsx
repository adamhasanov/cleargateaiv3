"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { ArrowRightIcon } from "./Icons";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Branded 404, in the current interface language. Used by [lang]/not-found and global-not-found. */
export function NotFoundView() {
  const { locale, dict } = useI18n();
  const t = dict.notFound;

  return (
    <>
      {/* React hoists this into <head>; the layout's title would otherwise describe the landing page. */}
      <title>{t.metaTitle}</title>
      <SiteHeader />
      <main className="not-found" aria-labelledby="not-found-title">
        <div className="hero-bg" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative still, same asset as the hero poster */}
          <img className="hero-bg__media" src="/media/hero-harbor-poster.jpg" alt="" decoding="async" />
          <div className="hero-bg__overlay" />
        </div>
        <div className="container not-found__content">
          <p className="not-found__digits" aria-hidden="true">404</p>
          <p className="eyebrow">{t.code}</p>
          <h1 id="not-found-title" className="not-found__title">{t.title}</h1>
          <p className="not-found__text">{t.text}</p>
          <div className="hero__actions">
            <Link href={`/${locale}`} className="btn btn--primary btn--lg">
              {t.home}
            </Link>
            <Link href={`/${locale}/check`} className="btn btn--outline btn--lg">
              {dict.nav.startCheck}
              <ArrowRightIcon size={18} />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter dict={dict} locale={locale} />
    </>
  );
}
