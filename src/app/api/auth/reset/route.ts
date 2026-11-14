import { createSession, destroyAllSessions, hashPassword, setSessionCookie, sha256 } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, fail, handler, json, readJson } from "@/lib/server/http";
import { resetSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** Sets a new password from a valid, unused, unexpired token; signs out every other session. */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { token, password } = await readJson(request, resetSchema);
  const db = await getDb();
  const passwordHash = await hashPassword(password);

  const userId = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ user_id: string }>(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [sha256(token)],
    );
    const id = rows[0]?.user_id;
    if (!id) return null;
    await tx.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [passwordHash, id]);
    await destroyAllSessions(id, tx);
    return id;
  });
  if (!userId) return fail("invalidToken", 400);

  const { token: session, expires } = await createSession(userId, db);
  await setSessionCookie(session, expires);
  return json({ ok: true });
});
