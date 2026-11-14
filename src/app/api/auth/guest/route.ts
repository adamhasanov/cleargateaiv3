import { z } from "zod";
import { allowAttempt, createSession, recordFailure, setSessionCookie } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { createGuestUser } from "@/lib/server/guest";
import { assertSameOrigin, clientIp, fail, handler, json, readJson } from "@/lib/server/http";
import { localeSchema } from "@/lib/validation";

export const runtime = "nodejs";

const schema = z.object({ locale: localeSchema.default("az") });

/**
 * One-click trial: creates a temporary guest account on the Free plan and signs it in.
 * Limited per IP (10 guests per 15 minutes) so it cannot be used to farm free checks.
 */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { locale } = await readJson(request, schema);
  const key = `guest|${clientIp(request)}`;
  if (!allowAttempt(key)) return fail("tooManyAttempts", 429);
  recordFailure(key); // counts every guest created

  const db = await getDb();
  const user = await createGuestUser(db, locale);
  const { token, expires } = await createSession(user.id, db);
  await setSessionCookie(token, expires);
  return json({ user }, 201);
});
