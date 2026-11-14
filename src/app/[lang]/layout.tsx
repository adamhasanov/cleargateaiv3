import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALES, type Locale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/I18nProvider";
import "../globals.css";
import "../portal.css";

const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", variable: "--font-sans" });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

/**
 * This is the root layout, so it must not reject anything itself: a notFound()
 * thrown here has no boundary above it and shows Next's unbranded page. For a
 * URL whose first segment is not a language (e.g. /about), it renders in the
 * default language and the page below calls notFound(), which shows the
 * branded [lang]/not-found. (Request headers cannot be read here: /about is
 * served by the statically generated [lang] page.)
 */
function resolveLocale(lang: string): Locale {
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDictionary(resolveLocale(lang));
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])) },
  };
}

export const viewport: Viewport = { themeColor: "#061D27", width: "device-width", initialScale: 1 };

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const locale = resolveLocale((await params).lang);
  return (
    <html lang={locale} className={inter.variable}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
