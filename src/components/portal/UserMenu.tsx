"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { logout, useMe } from "@/lib/client/session";
import { CardIcon, ChatIcon, ChevronDownIcon, GridIcon, LogoutIcon, UserIcon } from "../Icons";

/** Header control: "Sign in" when signed out, an account menu when signed in. */
export function UserMenu() {
  const me = useMe();
  const { locale, dict } = useI18n();
  const t = dict.portal.nav;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (me === undefined) return <span className="user-menu__placeholder" aria-hidden="true" />;
  if (me === null) {
    return (
      <Link href={`/${locale}/login`} className="btn btn--outline btn--sm user-menu__login">
        <UserIcon size={18} />
        <span>{t.login}</span>
      </Link>
    );
  }

  const initial = (me.name || me.email).trim().charAt(0).toUpperCase();
  const items = [
    { href: `/${locale}/dashboard`, label: t.dashboard, Icon: GridIcon },
    { href: `/${locale}/advisor`, label: t.advisor, Icon: ChatIcon },
    { href: `/${locale}/pricing`, label: t.pricing, Icon: CardIcon },
    { href: `/${locale}/account`, label: t.account, Icon: UserIcon },
  ];

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu__button" aria-haspopup="true" aria-expanded={open} aria-label={t.menu} onClick={() => setOpen((o) => !o)}>
        <span className="user-menu__avatar" aria-hidden="true">{initial}</span>
        <ChevronDownIcon size={16} />
      </button>
      {open && (
        <div className="user-menu__panel">
          <p className="user-menu__who">
            <strong>{me.name || me.email}</strong>
            {me.name && <span>{me.email}</span>}
          </p>
          <ul>
            {items.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link href={href} className="user-menu__item" onClick={() => setOpen(false)}>
                  <Icon size={18} />
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="user-menu__item"
                onClick={async () => {
                  setOpen(false);
                  await logout();
                  router.push(`/${locale}`);
                }}
              >
                <LogoutIcon size={18} />
                {t.logout}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
