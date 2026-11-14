import { getAccountState } from "@/lib/billing/account";
import { getPlans, singleCheckPrice } from "@/lib/billing/plans";
import { checkTotals } from "@/lib/server/checks";
import { getDb } from "@/lib/server/db";
import { handler, json, requireUser } from "@/lib/server/http";
import { paymentsConfigured } from "@/lib/payments/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plan, usage, credits and totals for the signed-in user, plus the plan catalogue for upgrade choices. */
export const GET = handler(async () => {
  const user = await requireUser();
  const db = await getDb();
  return json({
    user,
    account: await getAccountState(db, user.id),
    totals: await checkTotals(db, user.id),
    plans: getPlans(),
    singleCheckPriceMinor: singleCheckPrice(),
    paymentsConfigured: paymentsConfigured(),
  });
});
