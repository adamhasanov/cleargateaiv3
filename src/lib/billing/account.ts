import "server-only";
import type { Queryable } from "@/lib/server/db";
import { getPlan, type BillingPeriod, type Plan, type PlanCode } from "./plans";

export interface SubscriptionInfo {
  id: string;
  planCode: PlanCode;
  billingPeriod: BillingPeriod;
  status: "active" | "canceled" | "expired";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface AccountState {
  plan: Plan;
  subscription: SubscriptionInfo | null;
  /** Usage window: the paid period; for a one-time allowance (Free) the whole account life. */
  period: { start: string; end: string };
  usage: { used: number; limit: number | null; remaining: number | null };
  /** Paid single checks not used yet. */
  credits: number;
}

function calendarMonth(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * The account's plan, usage and credits, computed from the database on every
 * call (never trusted from the client). Subscriptions past their end date are
 * marked expired here, so expiry needs no scheduled job.
 */
export async function getAccountState(db: Queryable, userId: string): Promise<AccountState> {
  await db.query(
    `UPDATE subscriptions SET status = 'expired', updated_at = now()
      WHERE user_id = $1 AND status = 'active' AND current_period_end <= now()`,
    [userId],
  );
  const { rows: subs } = await db.query<{
    id: string; plan_code: PlanCode; billing_period: BillingPeriod; status: SubscriptionInfo["status"];
    current_period_start: Date; current_period_end: Date; cancel_at_period_end: boolean;
  }>(
    `SELECT id, plan_code, billing_period, status, current_period_start, current_period_end, cancel_at_period_end
       FROM subscriptions WHERE user_id = $1 AND status = 'active' LIMIT 1`,
    [userId],
  );
  const sub = subs[0];
  const plan = getPlan(sub?.plan_code ?? "free")!;
  // Paid plans count per paid period; a one-time allowance (Free) counts over the account's whole life.
  const window = sub
    ? { start: new Date(sub.current_period_start), end: new Date(sub.current_period_end) }
    : plan.checkLimitPeriod === "once"
      ? { start: new Date(0), end: new Date(Date.UTC(9999, 0, 1)) }
      : calendarMonth();

  const { rows: usage } = await db.query<{ used: string }>(
    `SELECT count(*)::text AS used FROM checks
      WHERE user_id = $1 AND funding = 'plan' AND status <> 'failed' AND created_at >= $2 AND created_at < $3`,
    [userId, window.start, window.end],
  );
  const { rows: credits } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM check_credits WHERE user_id = $1 AND used_by_check_id IS NULL`,
    [userId],
  );
  const used = Number(usage[0]?.used ?? 0);
  const limit = plan.monthlyCheckLimit;

  return {
    plan,
    subscription: sub
      ? {
          id: sub.id, planCode: sub.plan_code, billingPeriod: sub.billing_period, status: sub.status,
          currentPeriodStart: new Date(sub.current_period_start).toISOString(),
          currentPeriodEnd: new Date(sub.current_period_end).toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }
      : null,
    period: { start: window.start.toISOString(), end: window.end.toISOString() },
    usage: { used, limit, remaining: limit === null ? null : Math.max(0, limit - used) },
    credits: Number(credits[0]?.n ?? 0),
  };
}
