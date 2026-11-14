import { getPlans, singleCheckPrice } from "@/lib/billing/plans";
import { handler, json } from "@/lib/server/http";
import { paymentsConfigured } from "@/lib/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public plan catalogue with the currently configured prices (null = not approved yet). */
export const GET = handler(async () =>
  json({ plans: getPlans(), singleCheckPriceMinor: singleCheckPrice(), paymentsConfigured: paymentsConfigured() }),
);
