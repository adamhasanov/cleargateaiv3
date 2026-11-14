import { z } from "zod";
import { sendMessage } from "@/lib/server/advisor";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, handler, json, readJson, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ content: z.string().trim().min(1).max(4000), locale: z.enum(["az", "ru", "en"]) });

export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { content, locale } = await readJson(request, schema);
  return json(await sendMessage(await getDb(), user.id, (await ctx.params).id, content, locale), 201);
});
