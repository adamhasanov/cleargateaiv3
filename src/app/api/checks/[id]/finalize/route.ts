import { getAccountState } from "@/lib/billing/account";
import { finalizeCheck } from "@/lib/server/checks";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, handler, json, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";

/** Compares the server-held extractions with the rule engine and scores the risk; the client sends no values. */
export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const db = await getDb();
  const check = await finalizeCheck(db, user.id, (await ctx.params).id);
  return json({ check, account: await getAccountState(db, user.id) });
});
