import { describe, expect, it } from "vitest";
import { getDb } from "./db";

describe("database", () => {
  it("applies migrations and syncs the plan catalogue", async () => {
    const db = await getDb();
    const { rows } = await db.query<{ code: string; monthly_check_limit: number | null }>(
      `SELECT code, monthly_check_limit FROM plans ORDER BY sort_order`,
    );
    expect(rows.map((r) => r.code)).toEqual(["free", "starter", "professional", "business"]);
    const { rows: tables } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining(["users", "sessions", "password_reset_tokens", "plans", "subscriptions", "payments",
        "payment_events", "checks", "check_credits", "chat_conversations", "chat_messages", "schema_migrations"]),
    );
  });

  it("enforces one active subscription per user and valid enum values", async () => {
    const db = await getDb();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ('constraint@test.local', 'x') RETURNING id`,
    );
    const user = rows[0].id;
    const insertSub = () =>
      db.query(
        `INSERT INTO subscriptions (user_id, plan_code, billing_period, status, current_period_start, current_period_end)
         VALUES ($1, 'starter', 'monthly', 'active', now(), now() + interval '1 month')`,
        [user],
      );
    await insertSub();
    await expect(insertSub()).rejects.toThrow();
    await expect(db.query(`UPDATE users SET role = 'superuser' WHERE id = $1`, [user])).rejects.toThrow();
    await expect(
      db.query(`INSERT INTO users (email, password_hash) VALUES ('CONSTRAINT@test.local', 'x')`),
    ).rejects.toThrow(); // e-mail uniqueness ignores case
  });
});
