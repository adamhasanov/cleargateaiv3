import { getCheck } from "@/lib/server/checks";
import { getDb } from "@/lib/server/db";
import { fail, handler, json, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 404 for checks that do not exist or belong to someone else (no way to tell the two apart). */
export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const check = await getCheck(await getDb(), user.id, (await ctx.params).id);
  return check ? json({ check }) : fail("checkNotFound", 404);
});
