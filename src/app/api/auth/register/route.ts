import { createSession, hashPassword, setSessionCookie } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { assertSameOrigin, fail, handler, json, readJson } from "@/lib/server/http";
import { registerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { email, password, name, locale } = await readJson(request, registerSchema);
  const db = await getDb();
  const passwordHash = await hashPassword(password);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, locale) VALUES ($1, $2, $3, $4)
     ON CONFLICT ((lower(email))) DO NOTHING RETURNING id`,
    [email, name, passwordHash, locale],
  );
  if (!rows[0]) return fail("emailTaken", 409);
  const { token, expires } = await createSession(rows[0].id, db);
  await setSessionCookie(token, expires);
  return json({ user: { id: rows[0].id, email, name, role: "user", locale } }, 201);
});
