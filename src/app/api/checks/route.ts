import { z } from "zod";
import { getAccountState } from "@/lib/billing/account";
import { listChecks, startCheck } from "@/lib/server/checks";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, handler, json, readJson, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fileName = z.string().trim().min(1).max(255);
const startSchema = z.object({ documentNames: z.object({ invoice: fileName, packingList: fileName, customsDocument: fileName }) });

/** Reserves a check against the plan allowance or a paid credit (402 limitReached when neither is left). */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { documentNames } = await readJson(request, startSchema);
  const db = await getDb();
  const check = await startCheck(db, user.id, documentNames);
  return json({ check, account: await getAccountState(db, user.id) }, 201);
});

/** The signed-in user's own checks within their plan's history window. */
export const GET = handler(async () => {
  const user = await requireUser();
  return json({ checks: await listChecks(await getDb(), user.id) });
});
