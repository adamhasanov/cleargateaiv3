import { notFound } from "next/navigation";
import { PaymentStatus } from "@/components/portal/PaymentStatus";
import { isLocale } from "@/i18n/config";

export default async function Page({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params;
  if (!isLocale(lang) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <PaymentStatus id={id} />;
}
