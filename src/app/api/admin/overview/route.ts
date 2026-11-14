import { getDb } from "@/lib/server/db";
import { handler, json, requireUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only operational totals. Aggregates only: no user's documents,
 * results or conversations are exposed. Grant the role with `npm run user:role`.
 */
export const GET = handler(async () => {
  await requireUser("admin");
  const db = await getDb();
  const one = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);
  const { rows: plans } = await db.query<{ plan_code: string; n: string }>(
    `SELECT plan_code, count(*)::text AS n FROM subscriptions WHERE status = 'active' AND current_period_end > now() GROUP BY plan_code ORDER BY plan_code`,
  );
  return json({
    users: await one(`SELECT count(*)::text AS n FROM users`),
    checks: {
      total: await one(`SELECT count(*)::text AS n FROM checks`),
      last30Days: await one(`SELECT count(*)::text AS n FROM checks WHERE created_at > now() - interval '30 days'`),
      failed: await one(`SELECT count(*)::text AS n FROM checks WHERE status = 'failed'`),
    },
    activeSubscriptions: Object.fromEntries(plans.map((p) => [p.plan_code, Number(p.n)])),
    payments: {
      succeeded: await one(`SELECT count(*)::text AS n FROM payments WHERE status = 'succeeded'`),
      pending: await one(`SELECT count(*)::text AS n FROM payments WHERE status = 'pending'`),
      failed: await one(`SELECT count(*)::text AS n FROM payments WHERE status = 'failed'`),
    },
    advisorMessages30Days: await one(`SELECT count(*)::text AS n FROM chat_messages WHERE role = 'user' AND created_at > now() - interval '30 days'`),
  });
});
