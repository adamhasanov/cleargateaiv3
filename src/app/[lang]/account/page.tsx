import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Account } from "@/components/portal/Account";
import { isLocale } from "@/i18n/config";

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  if (!isLocale((await params).lang)) notFound();
  return (
    <Suspense>
      <Account />
    </Suspense>
  );
}
