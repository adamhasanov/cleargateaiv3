import { failCheck } from "@/lib/server/checks";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, handler, json, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";

/** Closes a check that could not be completed; its usage (or paid credit) is returned. */
export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const user = await requireUser();
  await failCheck(await getDb(), user.id, (await ctx.params).id);
  return json({ ok: true });
});
