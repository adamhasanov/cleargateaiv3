import { z } from "zod";
import { getAccountState } from "@/lib/billing/account";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, fail, handler, json, readJson, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["cancel", "resume"]) });

/**
 * cancel: the subscription stays active until the end of the paid period, then expires (no further charge —
 *         renewals are explicit payments). resume: undo a pending cancellation.
 */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { action } = await readJson(request, schema);
  const db = await getDb();
  const { rowCount } = await db.query(
    `UPDATE subscriptions SET cancel_at_period_end = $2, updated_at = now()
      WHERE user_id = $1 AND status = 'active' AND current_period_end > now()`,
    [user.id, action === "cancel"],
  );
  if (rowCount === 0) return fail("noActiveSubscription", 404);
  return json({ account: await getAccountState(db, user.id) });
});
