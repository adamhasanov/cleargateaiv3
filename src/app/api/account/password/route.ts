import {
  allowAttempt, clearFailures, createSession, destroyAllSessions, hashPassword, recordFailure, setSessionCookie, verifyPassword,
} from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, fail, handler, json, readJson, requireUser } from "@/lib/server/http";
import { changePasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Changes the password after re-checking the current one; signs out all other sessions. */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { currentPassword, newPassword } = await readJson(request, changePasswordSchema);
  const key = `pw|${user.id}`;
  if (!allowAttempt(key)) return fail("tooManyAttempts", 429);

  const db = await getDb();
  const { rows } = await db.query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
  if (!rows[0] || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
    recordFailure(key);
    return fail("wrongPassword", 400);
  }
  clearFailures(key);
  const hash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [hash, user.id]);
    await destroyAllSessions(user.id, tx);
  });
  const { token, expires } = await createSession(user.id, db);
  await setSessionCookie(token, expires);
  return json({ ok: true });
});
