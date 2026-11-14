import { beforeAll, describe, expect, it } from "vitest";
import { getAccountState } from "@/lib/billing/account";
import type { DocumentExtraction, DocumentId } from "@/lib/engine/types";
import { getDb, type Db } from "./db";
import { HttpError } from "./http";
import { assertCheckAcceptsDocument, failCheck, finalizeCheck, getCheck, listChecks, recordExtraction, startCheck } from "./checks";

const names = { invoice: "inv.pdf", packingList: "pl.pdf", customsDocument: "cd.pdf" };
const v = (raw: string, number: number, unit: string, basis?: "gross") => ({ status: "value" as const, value: { raw, number, unit, ...(basis ? { basis } : {}) } });
const ex = (document: DocumentId, weight: number): DocumentExtraction => ({
  document, readable: true,
  fields: {
    weight: v(`${weight} kg`, weight, "kg", "gross"), quantity: v("40 cartons", 40, "cartons"),
    price: v("18500 USD", 18500, "USD"), hsCode: { status: "value", value: { raw: "0000.00", code: "0000.00" } },
  },
});

let db: Db;
async function user(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [email]);
  return rows[0].id;
}
async function completedCheck(userId: string, packingWeight = 1200) {
  const { id } = await startCheck(db, userId, names);
  await recordExtraction(db, userId, id, ex("invoice", 1250));
  await recordExtraction(db, userId, id, ex("packingList", packingWeight));
  await recordExtraction(db, userId, id, ex("customsDocument", 1250));
  return finalizeCheck(db, userId, id);
}
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof HttpError ? `${e.status} ${e.code}` : String(e)));

beforeAll(async () => {
  db = await getDb();
});

describe("document checks (server side)", () => {
  it("computes the result and risk score on the server from stored extractions", async () => {
    const alice = await user("checks-alice@test.local");
    const check = await completedCheck(alice);
    expect(check.status).toBe("completed");
    expect(check.result?.resultClass).toBe("mismatchesFound");
    // Only the weight differs: 50 / 1250 kg = 4 % spread → moderate → 20 + 5 = 25 (medium).
    expect(check.risk).toMatchObject({ score: 25, level: "medium", version: "risk-1" });
  });

  it("gives the Free plan one check in total — not per month — enforced on the backend; a failed check gives it back", async () => {
    const u = await user("checks-limit@test.local");
    const first = await startCheck(db, u, names);
    expect(await code(startCheck(db, u, names))).toBe("402 limitReached");
    await failCheck(db, u, first.id); // a failed check gives its usage back
    await completedCheck(u);
    expect((await getAccountState(db, u)).usage).toEqual({ used: 1, limit: 1, remaining: 0 });
    expect(await code(startCheck(db, u, names))).toBe("402 limitReached");
    // The allowance never renews: a check from long ago still counts.
    await db.query(`UPDATE checks SET created_at = now() - interval '400 days' WHERE user_id = $1`, [u]);
    expect((await getAccountState(db, u)).usage.remaining).toBe(0);
    expect(await code(startCheck(db, u, names))).toBe("402 limitReached");
  });

  it("limits how many checks run at the same time (paid plan)", async () => {
    const u = await user("checks-concurrent@test.local");
    await db.query(
      `INSERT INTO subscriptions (user_id, plan_code, billing_period, status, current_period_start, current_period_end)
       VALUES ($1, 'professional', 'monthly', 'active', now(), now() + interval '1 month')`,
      [u],
    );
    for (let i = 0; i < 3; i++) await startCheck(db, u, names);
    expect(await code(startCheck(db, u, names))).toBe("429 tooManyChecks");
  });

  it("uses a paid single-check credit once the plan allowance is gone, and refunds it if the check fails", async () => {
    const u = await user("checks-credit@test.local");
    await completedCheck(u);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO payments (user_id, purpose, amount_minor, currency, status, provider, order_id, idempotency_key)
       VALUES ($1, 'check_credit', 100, 'AZN', 'succeeded', 'epoint', gen_random_uuid()::text, 'k1') RETURNING id`, [u]);
    await db.query(`INSERT INTO check_credits (user_id, payment_id) VALUES ($1, $2)`, [u, rows[0].id]);
    expect((await getAccountState(db, u)).credits).toBe(1);

    const first = await startCheck(db, u, names);
    expect(first.funding).toBe("credit");
    expect((await getAccountState(db, u)).credits).toBe(0);
    await failCheck(db, u, first.id);
    expect((await getAccountState(db, u)).credits).toBe(1); // refunded
    const second = await startCheck(db, u, names);
    expect(second.funding).toBe("credit");
    expect(await code(startCheck(db, u, names))).toBe("402 limitReached");
  });

  it("reads each document of a check once, and only while it is processing", async () => {
    const u = await user("checks-once@test.local");
    const { id } = await startCheck(db, u, names);
    await recordExtraction(db, u, id, ex("invoice", 1));
    expect(await code(assertCheckAcceptsDocument(db, u, id, "invoice"))).toBe("409 documentAlreadyRead");
    expect(await code(finalizeCheck(db, u, id))).toBe("409 documentsMissing");
    await failCheck(db, u, id);
    expect(await code(assertCheckAcceptsDocument(db, u, id, "packingList"))).toBe("409 checkClosed");
  });

  it("keeps each user's checks private", async () => {
    const owner = await user("privacy-owner@test.local");
    const other = await user("privacy-other@test.local");
    const check = await completedCheck(owner);
    expect(await getCheck(db, other, check.id)).toBeNull();
    expect((await listChecks(db, other)).map((c) => c.id)).not.toContain(check.id);
    expect(await code(assertCheckAcceptsDocument(db, other, check.id, "invoice"))).toBe("404 checkNotFound");
    expect(await code(finalizeCheck(db, other, check.id))).toBe("404 checkNotFound");
    expect(await code(recordExtraction(db, other, check.id, ex("invoice", 1)))).toBe("409 checkClosed");
    expect((await getCheck(db, owner, check.id))?.id).toBe(check.id);
  });
});
