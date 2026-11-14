import { z } from "zod";
import { assertAdvisorAccess, createConversation, listConversations } from "@/lib/server/advisor";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, handler, json, readJson, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  return json({ conversations: await listConversations(await getDb(), user.id) });
});

const schema = z.object({ checkId: z.string().uuid().nullable().default(null) });

/** New conversation, optionally about one of the user's own checks. */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { checkId } = await readJson(request, schema);
  const db = await getDb();
  await assertAdvisorAccess(db, user.id);
  return json({ conversation: await createConversation(db, user.id, checkId) }, 201);
});
