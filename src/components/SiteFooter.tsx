import type { Dictionary, Locale } from "@/i18n/config";
import { Logo } from "./Logo";

export function SiteFooter({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <Logo locale={locale} />
        <p className="site-footer__note">{dict.footer.note}</p>
        <p className="site-footer__meta">© {2026} ClearGateAI · {dict.footer.prototype}</p>
      </div>
    </footer>
  );
}
