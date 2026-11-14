import { deleteConversation, getConversation } from "@/lib/server/advisor";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, fail, handler, json, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireUser();
  const data = await getConversation(await getDb(), user.id, (await ctx.params).id);
  return data ? json(data) : fail("conversationNotFound", 404);
});

export const DELETE = handler(async (request: Request, ctx: Ctx) => {
  assertSameOrigin(request);
  const user = await requireUser();
  return (await deleteConversation(await getDb(), user.id, (await ctx.params).id)) ? json({ ok: true }) : fail("conversationNotFound", 404);
});
