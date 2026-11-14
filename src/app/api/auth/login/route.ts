import {
  allowAttempt, clearFailures, createSession, recordFailure, setSessionCookie, verifyAgainstDummy, verifyPassword,
} from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, clientIp, fail, handler, json, readJson } from "@/lib/server/http";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { email, password } = await readJson(request, loginSchema);
  const key = `${clientIp(request)}|${email}`;
  if (!allowAttempt(key)) return fail("tooManyAttempts", 429);

  const db = await getDb();
  const { rows } = await db.query<{ id: string; email: string; name: string; role: string; locale: string; password_hash: string }>(
    `SELECT id, email, name, role, locale, password_hash FROM users WHERE lower(email) = $1`,
    [email],
  );
  const user = rows[0];
  const ok = user ? await verifyPassword(password, user.password_hash) : (await verifyAgainstDummy(password), false);
  if (!user || !ok) {
    recordFailure(key);
    return fail("invalidCredentials", 401); // same answer for unknown e-mail and wrong password
  }
  clearFailures(key);
  const { token, expires } = await createSession(user.id, db);
  await setSessionCookie(token, expires);
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale } });
});
