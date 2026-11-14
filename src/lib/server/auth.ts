import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getDb, type Queryable } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

export const SESSION_COOKIE = "cg_session";
const SESSION_DAYS = 30;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };

export type Role = "user" | "admin";
export type Locale = "az" | "ru" | "en";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: Locale;
}

// ---------- passwords ----------

/** scrypt$N$r$p$salt$hash (base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2 });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const N = Number(n), R = Number(r), P = Number(p);
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Same work as a real check, so unknown e-mails take as long as wrong passwords. */
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
export async function verifyAgainstDummy(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}

// ---------- tokens ----------

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// ---------- sessions ----------

export async function createSession(userId: string, db?: Queryable): Promise<{ token: string; expires: Date }> {
  const conn = db ?? (await getDb());
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await conn.query(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`, [sha256(token), userId, expires]);
  return { token, expires };
}

export async function setSessionCookie(token: string, expires: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

/** Resolves a session token to its user; null if missing, unknown or expired. */
export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const db = await getDb();
  const { rows } = await db.query<SessionUser & { session_id: string; last_seen_at: Date }>(
    `SELECT u.id, u.email, u.name, u.role, u.locale, s.id AS session_id, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) return null;
  // Touch at most every 10 minutes to avoid a write per request.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 600_000) {
    await db.query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id]);
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, locale: row.locale };
}

/** The signed-in user for this request, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return userForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function destroyCurrentSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await (await getDb()).query(`DELETE FROM sessions WHERE id = $1`, [sha256(token)]);
  await clearSessionCookie();
}

export async function destroyAllSessions(userId: string, db?: Queryable): Promise<void> {
  await (db ?? (await getDb())).query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

// ---------- brute-force protection (best effort, per server instance) ----------

const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

/** Returns false once a key (e.g. ip+email) has failed too often in the window. */
export function allowAttempt(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.first > WINDOW_MS) return true;
  return a.count < MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.first > WINDOW_MS) attempts.set(key, { count: 1, first: now });
  else a.count += 1;
  if (attempts.size > 10_000) attempts.clear();
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
