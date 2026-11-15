import type { Plan } from "@/lib/billing/plans";

/**
 * Pure rules for the SIMULATED plan limits of the demo (no server, no storage here).
 * Free: one check in total. Paid plans: a monthly allowance (calendar month, local time).
 */

export interface Usage {
  used: number;
  limit: number | null;
  remaining: number | null;
}

export function usageFor(plan: Plan, checks: { createdAt: string }[], now = new Date()): Usage {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const used = checks.filter((c) => plan.checkLimitPeriod === "once" || new Date(c.createdAt).getTime() >= monthStart).length;
  const limit = plan.monthlyCheckLimit;
  return { used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
}

/** Where the next check would be funded from, or null when none is left. */
export function fundingFor(usage: Usage, credits: number): "plan" | "credit" | null {
  if (usage.remaining === null || usage.remaining > 0) return "plan";
  return credits > 0 ? "credit" : null;
}

/** Checks inside the plan's history window, newest first. */
export function visibleChecks<T extends { createdAt: string }>(plan: Plan, checks: T[], now = new Date()): T[] {
  const cutoff = plan.historyDays === null ? 0 : now.getTime() - plan.historyDays * 86_400_000;
  return checks.filter((c) => new Date(c.createdAt).getTime() >= cutoff).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
