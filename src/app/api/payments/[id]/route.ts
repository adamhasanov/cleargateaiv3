import { getDb } from "@/lib/server/db";
import { fail, handler, json, requireUser } from "@/lib/server/http";
import { getPaymentForUser } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status of one of the user's payments; a pending payment is reconciled with the provider first. */
export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const payment = await getPaymentForUser(await getDb(), user.id, (await ctx.params).id);
  return payment ? json({ payment }) : fail("paymentNotFound", 404);
});
