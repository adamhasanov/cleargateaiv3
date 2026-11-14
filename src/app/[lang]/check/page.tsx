import { notFound } from "next/navigation";
import { CheckFlow } from "@/components/check/CheckFlow";
import { isLocale } from "@/i18n/config";

export default async function CheckPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <CheckFlow />;
}
