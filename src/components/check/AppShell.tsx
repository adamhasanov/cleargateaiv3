"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { CardIcon, ChatIcon, FileIcon, GridIcon, HomeIcon, InfoIcon, UserIcon } from "../Icons";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { Logo } from "../Logo";
import { UserMenu } from "../portal/UserMenu";

/**
 * Layout for the signed-in product: header (logo, language, account) and a
 * sidebar that becomes a scrollable tab bar on phones.
 */
export function AppShell({ children, lockLanguage = false }: { children: ReactNode; lockLanguage?: boolean }) {
  const { locale, dict } = useI18n();
  const pathname = usePathname() ?? "";
  const listRef = useRef<HTMLUListElement>(null);
  const section = pathname.split("/")[2] ?? "";

  const items = [
    { key: "check", href: `/${locale}/check`, label: dict.app.sidebarCheck, Icon: FileIcon, primary: true },
    { key: "dashboard", href: `/${locale}/dashboard`, label: dict.portal.nav.dashboard, Icon: GridIcon, primary: true, alsoActive: ["checks"] },
    { key: "advisor", href: `/${locale}/advisor`, label: dict.portal.nav.advisor, Icon: ChatIcon, primary: true },
    { key: "pricing", href: `/${locale}/pricing`, label: dict.portal.nav.pricing, Icon: CardIcon, primary: true, alsoActive: ["payments"] },
    { key: "account", href: `/${locale}/account`, label: dict.portal.nav.account, Icon: UserIcon, primary: true },
    { key: "how", href: `/${locale}#how`, label: dict.app.sidebarHow, Icon: InfoIcon, primary: false },
    { key: "home", href: `/${locale}`, label: dict.app.sidebarHome, Icon: HomeIcon, primary: false },
  ];
  const isActive = (i: (typeof items)[number]) => i.key === section || (i.alsoActive ?? []).includes(section);

  // On phones the tab bar scrolls sideways: keep the current tab in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [section]);

  return (
    <div className="app">
      <header className="app-header">
        <Logo locale={locale} />
        <div className="app-header__actions">
          <LanguageSwitcher inPlace={section === "check"} disabled={lockLanguage} />
          <UserMenu />
        </div>
      </header>
      <div className="app-body">
        <nav className="app-sidebar" aria-label={dict.app.appNav}>
          <ul ref={listRef}>
            {items.map((i) => (
              <li key={i.key} className={i.primary ? undefined : "app-sidebar__secondary"}>
                <Link
                  href={i.href}
                  className={`app-sidebar__link ${isActive(i) ? "app-sidebar__link--active" : ""}`}
                  aria-current={isActive(i) ? "page" : undefined}
                >
                  <i.Icon size={20} />
                  <span>{i.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
