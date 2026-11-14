import { beforeAll, describe, expect, it } from "vitest";
import { getAccountState } from "@/lib/billing/account";
import { verifyPassword } from "./auth";
import { getDb, type Db } from "./db";
import { createGuestUser, GUEST_EMAIL_DOMAIN, isGuestEmail } from "./guest";
import { startCheck } from "./checks";

const names = { invoice: "a.pdf", packingList: "b.pdf", customsDocument: "c.pdf" };
let db: Db;
beforeAll(async () => {
  db = await getDb();
});

describe("guest access", () => {
  it("creates a separate Free-plan account on the reserved guest domain, named in the chosen language", async () => {
    const a = await createGuestUser(db, "az");
    const b = await createGuestUser(db, "ru");
    expect(a.email).not.toBe(b.email);
    expect(a.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)).toBe(true);
    expect(isGuestEmail(a.email)).toBe(true);
    expect(isGuestEmail("someone@example.com")).toBe(false);
    expect([a.name, b.name]).toEqual(["Qonaq", "Гость"]);
    const state = await getAccountState(db, a.id);
    expect(state.plan.code).toBe("free");
    expect(state.usage).toEqual({ used: 0, limit: 1, remaining: 1 });
  });

  it("gets exactly the Free allowance: one check, then the limit applies on the server", async () => {
    const g = await createGuestUser(db, "en");
    await startCheck(db, g.id, names);
    await expect(startCheck(db, g.id, names)).rejects.toMatchObject({ status: 402, code: "limitReached" });
  });

  it("cannot be signed into later: the random password is never revealed or guessable", async () => {
    const g = await createGuestUser(db, "en");
    const { rows } = await db.query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [g.id]);
    for (const guess of ["", "password", "guest", g.email, "Guest123456"]) expect(await verifyPassword(guess, rows[0].password_hash)).toBe(false);
  });
});
