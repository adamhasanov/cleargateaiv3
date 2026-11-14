"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { ArrowRightIcon, MenuIcon, XIcon } from "./Icons";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { UserMenu } from "./portal/UserMenu";

export function SiteHeader() {
  const { locale, dict } = useI18n();
  const [open, setOpen] = useState(false);
  // On phones and tablets the header is fixed; it gets a solid background once
  // the page is scrolled so it stays readable over the content below the hero.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const links = [
    { href: `/${locale}#top`, label: dict.nav.home },
    { href: `/${locale}#how`, label: dict.nav.how },
    { href: `/${locale}#advantages`, label: dict.nav.advantages },
    { href: `/${locale}#about`, label: dict.nav.about },
  ];

  return (
    <header className={`site-header ${scrolled || open ? "site-header--solid" : ""}`}>
      <div className="container site-header__inner">
        <Logo locale={locale} />
        <nav aria-label={dict.nav.mainNav} className={`site-nav ${open ? "site-nav--open" : ""}`} id="site-nav">
          <ul className="site-nav__list">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="site-nav__link" onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Link href={`/${locale}/check`} className="btn btn--primary site-nav__mobile-cta" onClick={() => setOpen(false)}>
            {dict.nav.startCheck}
            <ArrowRightIcon size={18} />
          </Link>
        </nav>
        <div className="site-header__actions">
          <LanguageSwitcher />
          <UserMenu />
          <Link href={`/${locale}/check`} className="btn btn--primary btn--sm site-header__cta">
            {dict.nav.startCheck}
            <ArrowRightIcon size={18} />
          </Link>
          <button
            type="button"
            className="icon-btn site-header__menu"
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? dict.nav.closeMenu : dict.nav.openMenu}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <XIcon size={22} /> : <MenuIcon size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}
