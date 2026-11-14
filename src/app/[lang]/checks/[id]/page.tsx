import { notFound } from "next/navigation";
import { CheckDetail } from "@/components/portal/CheckDetail";
import { isLocale } from "@/i18n/config";

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params;
  if (!isLocale(lang) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <CheckDetail id={id} />;
}
