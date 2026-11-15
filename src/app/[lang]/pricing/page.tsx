import { notFound } from "next/navigation";
import { Pricing } from "@/components/portal/Pricing";
import { isLocale } from "@/i18n/config";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  if (!isLocale((await params).lang)) notFound();
  return <Pricing />;
}
