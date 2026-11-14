import { z } from "zod";
import { PLAN_CODES } from "@/lib/billing/plans";
import { getDb } from "@/lib/server/db";
import { appBaseUrl, assertSameOrigin, handler, json, readJson, requireUser } from "@/lib/server/http";
import { listPayments, startPayment } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paidPlans = PLAN_CODES.filter((c) => c !== "free") as ["starter", "professional", "business"];
const schema = z.object({
  idempotencyKey: z.string().uuid(),
  language: z.enum(["az", "ru", "en"]),
  item: z.discriminatedUnion("purpose", [
    z.object({ purpose: z.literal("check_credit") }),
    z.object({ purpose: z.literal("subscription"), planCode: z.enum(paidPlans), billingPeriod: z.enum(["monthly", "annual"]) }),
  ]),
});

/** Starts a payment; the response carries the provider's checkout URL. Prices are server-side only. */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { idempotencyKey, language, item } = await readJson(request, schema);
  const result = await startPayment(await getDb(), user, item, idempotencyKey, appBaseUrl(request), language);
  return json(result, 201);
});

/** The signed-in user's own payment history. */
export const GET = handler(async () => {
  const user = await requireUser();
  return json({ payments: await listPayments(await getDb(), user.id) });
});
