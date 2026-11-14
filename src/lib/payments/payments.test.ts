import { beforeAll, describe, expect, it } from "vitest";
import { getAccountState } from "@/lib/billing/account";
import { getDb, type Db } from "@/lib/server/db";
import { decodeData, encodeData, mapStatus, sign, verify } from "./epoint";
import { applyProviderNotice } from "./service";

describe("Epoint protocol", () => {
  it("signs as base64(sha1_raw(private + data + private)) and verifies only the exact signature", () => {
    const data = encodeData({ public_key: "i000000001", amount: "30.75", currency: "AZN", language: "az", order_id: "1" });
    expect(decodeData(data)).toMatchObject({ order_id: "1", amount: "30.75" });
    const sig = sign("secret", data);
    expect(sig).toMatch(/^[A-Za-z0-9+/]{27}=$/); // 20-byte SHA-1 digest, base64
    expect(verify("secret", data, sig)).toBe(true);
    expect(verify("other", data, sig)).toBe(false);
    expect(verify("secret", data + "x", sig)).toBe(false);
    expect(verify("secret", data, "")).toBe(false);
  });

  it("maps provider statuses; only 'success' is a successful payment", () => {
    expect(["success", "new", "failed", "error", "server_error", "returned"].map(mapStatus)).toEqual(
      ["succeeded", "pending", "failed", "failed", "failed", "failed"]);
  });
});

describe("payment fulfilment", () => {
  let db: Db;
  let userId: string;
  beforeAll(async () => {
    db = await getDb();
    const { rows } = await db.query<{ id: string }>(`INSERT INTO users (email, password_hash) VALUES ('pay@test.local', 'x') RETURNING id`);
    userId = rows[0].id;
  });
  async function pending(purpose: "check_credit" | "subscription", amount: number, key: string) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO payments (user_id, purpose, plan_code, billing_period, amount_minor, currency, status, provider, order_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, 'AZN', 'pending', 'epoint', gen_random_uuid()::text, $6) RETURNING id`,
      [userId, purpose, purpose === "subscription" ? "professional" : null, purpose === "subscription" ? "annual" : null, amount, key]);
    await db.query(`UPDATE payments SET order_id = id::text WHERE id = $1`, [rows[0].id]);
    return rows[0].id;
  }

  it("grants a check credit exactly once, however often the notice arrives", async () => {
    const id = await pending("check_credit", 100, "c1");
    for (let i = 0; i < 3; i++) await applyProviderNotice(db, id, { status: "success", amount: 1 }, "callback");
    expect((await getAccountState(db, userId)).credits).toBe(1);
  });

  it("rejects a success whose amount differs from ours", async () => {
    const id = await pending("check_credit", 100, "c2");
    const p = await applyProviderNotice(db, id, { status: "success", amount: 0.01 }, "callback");
    expect(p).toMatchObject({ status: "failed", failureReason: "amount mismatch" });
    expect((await getAccountState(db, userId)).credits).toBe(1);
  });

  it("does not let a late failure undo a success, and activates the paid plan for 12 months", async () => {
    const id = await pending("subscription", 4000, "s1");
    await applyProviderNotice(db, id, { status: "success", amount: 40 }, "callback");
    const after = await applyProviderNotice(db, id, { status: "failed" }, "callback");
    expect(after?.status).toBe("succeeded");
    const state = await getAccountState(db, userId);
    expect(state.plan.code).toBe("professional");
    const months = (new Date(state.subscription!.currentPeriodEnd).getTime() - new Date(state.subscription!.currentPeriodStart).getTime()) / (30.44 * 86_400_000);
    expect(Math.round(months)).toBe(12);
  });

  it("ignores notices for unknown orders", async () => {
    expect(await applyProviderNotice(db, "no-such-order", { status: "success" }, "callback")).toBeNull();
  });
});
