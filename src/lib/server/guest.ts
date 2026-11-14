import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./auth";
import type { Queryable } from "./db";

/**
 * Guest access for trying the MVP with one click, without registration.
 *
 * A guest is an ordinary account on the Free plan (so it gets exactly the Free
 * allowance and its own private data) with a random e-mail on a reserved,
 * non-routable domain and a random password nobody ever sees — it can be used
 * only through the session created at that moment.
 */
export const GUEST_EMAIL_DOMAIN = "guest.cleargate.invalid";

const GUEST_NAMES = { az: "Qonaq", ru: "Гость", en: "Guest" } as const;

export const isGuestEmail = (email: string): boolean => email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);

export async function createGuestUser(db: Queryable, locale: "az" | "ru" | "en"): Promise<{ id: string; email: string; name: string; role: "user"; locale: "az" | "ru" | "en" }> {
  const email = `guest-${randomBytes(6).toString("hex")}@${GUEST_EMAIL_DOMAIN}`;
  const name = GUEST_NAMES[locale];
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, locale) VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, name, passwordHash, locale],
  );
  return { id: rows[0].id, email, name, role: "user", locale };
}
