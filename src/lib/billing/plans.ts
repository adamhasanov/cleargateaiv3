/**
 * Subscription plan catalogue — the single place to change what each plan includes.
 *
 * Limits and features below are INITIAL VALUES for testing, not approved
 * commercial terms. Prices are deliberately not written here: each comes from
 * an environment variable (amount in qəpik, i.e. 1/100 AZN) and a plan without
 * a configured price cannot be bought. See .env.example.
 *
 * Free needs no payment and applies to every account without an active paid subscription.
 */

export const PLAN_CODES = ["free", "starter", "professional", "business"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type PaidPlanCode = Exclude<PlanCode, "free">;
export const BILLING_PERIODS = ["monthly", "annual"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export type SupportLevel = "community" | "email" | "priority" | "dedicated";

export interface PlanFeatures {
  /** Document checks per billing period, or in total for a "once" plan. null = no limit. */
  monthlyCheckLimit: number | null;
  /** "month": the allowance renews every period. "once": a one-time allowance per account (Free). */
  checkLimitPeriod: "month" | "once";
  advisorAccess: boolean;
  riskScoreAccess: boolean;
  /** How far back document history is visible. null = all history. */
  historyDays: number | null;
  /** Seats per account. Shown for each plan; shared team accounts are not built yet. */
  maxUsers: number;
  /** Printable check report. */
  advancedReports: boolean;
  supportLevel: SupportLevel;
}

export interface Plan extends PlanFeatures {
  code: PlanCode;
  sortOrder: number;
  currency: "AZN";
  /** Price in qəpik, or null when not configured (then the plan cannot be purchased). */
  priceMonthlyMinor: number | null;
  priceAnnualMinor: number | null;
}

const FEATURES: Record<PlanCode, PlanFeatures> = {
  free: { monthlyCheckLimit: 1, checkLimitPeriod: "once", advisorAccess: false, riskScoreAccess: true, historyDays: 30, maxUsers: 1, advancedReports: false, supportLevel: "community" },
  starter: { monthlyCheckLimit: 30, checkLimitPeriod: "month", advisorAccess: true, riskScoreAccess: true, historyDays: 180, maxUsers: 1, advancedReports: false, supportLevel: "email" },
  professional: { monthlyCheckLimit: 150, checkLimitPeriod: "month", advisorAccess: true, riskScoreAccess: true, historyDays: null, maxUsers: 5, advancedReports: true, supportLevel: "priority" },
  business: { monthlyCheckLimit: 1000, checkLimitPeriod: "month", advisorAccess: true, riskScoreAccess: true, historyDays: null, maxUsers: 20, advancedReports: true, supportLevel: "dedicated" },
};

/** Reads a positive integer amount in qəpik from the environment; anything else means "not configured". */
export function priceFromEnv(name: string, env: Record<string, string | undefined> = process.env): number | null {
  const raw = env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function getPlans(env: Record<string, string | undefined> = process.env): Plan[] {
  return PLAN_CODES.map((code, i) => {
    const key = code.toUpperCase();
    return {
      code,
      sortOrder: i,
      currency: "AZN" as const,
      ...FEATURES[code],
      // Starter is sold per document (CHECK_PRICE_MINOR), never as a monthly/annual subscription.
      priceMonthlyMinor: code === "free" || code === "starter" ? null : priceFromEnv(`PLAN_PRICE_${key}_MONTHLY`, env),
      priceAnnualMinor: code === "free" || code === "starter" ? null : priceFromEnv(`PLAN_PRICE_${key}_ANNUAL`, env),
    };
  });
}

export function getPlan(code: string, env?: Record<string, string | undefined>): Plan | null {
  return getPlans(env).find((p) => p.code === code) ?? null;
}

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === "string" && (PLAN_CODES as readonly string[]).includes(value);
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === "string" && (BILLING_PERIODS as readonly string[]).includes(value);
}

/** Price of one pay-per-use document check, in qəpik (CHECK_PRICE_MINOR), or null when not configured. */
export function singleCheckPrice(env: Record<string, string | undefined> = process.env): number | null {
  return priceFromEnv("CHECK_PRICE_MINOR", env);
}

export function planPrice(plan: Plan, period: BillingPeriod): number | null {
  return period === "monthly" ? plan.priceMonthlyMinor : plan.priceAnnualMinor;
}

/** Length of one paid period. Annual = 12 calendar months. */
export function addPeriod(start: Date, period: BillingPeriod): Date {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + (period === "annual" ? 12 : 1));
  return end;
}
