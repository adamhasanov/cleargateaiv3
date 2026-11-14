"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useMe, type Me } from "@/lib/client/session";

/**
 * Shows children only to a signed-in user; otherwise sends them to sign in and back.
 * (Convenience only — every API route enforces authentication itself.)
 */
export function RequireUser({ children }: { children: (me: Me) => ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const { locale, dict } = useI18n();

  useEffect(() => {
    if (me === null) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/${locale}/login?next=${encodeURIComponent(next)}`);
    }
  }, [me, locale, router]);

  if (!me) return <p className="portal-loading" role="status">{dict.portal.common.loading}</p>;
  return <>{children(me)}</>;
}
