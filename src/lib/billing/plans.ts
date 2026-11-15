/**
 * Plan catalogue — the single place to change what each plan includes.
 *
 * MVP / demo: plans are SIMULATED in the browser. Choosing a plan changes the
 * demo profile only; no payment is taken and nothing is stored on a server.
 * Prices below are the owner-approved figures, in qəpik (1/100 AZN).
 */

export const PLAN_CODES = ["free", "starter", "professional", "business"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export type PaidPlanCode = Exclude<PlanCode, "free">;
export const BILLING_PERIODS = ["monthly", "annual"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
export type SupportLevel = "community" | "email" | "priority" | "dedicated";

export interface PlanFeatures {
  /** Document checks per month, or in total for a "once" plan. null = no limit. */
  monthlyCheckLimit: number | null;
  /** "month": the allowance renews every month. "once": a one-time allowance (Free). */
  checkLimitPeriod: "month" | "once";
  advisorAccess: boolean;
  riskScoreAccess: boolean;
  /** How far back document history is visible. null = all history. */
  historyDays: number | null;
  /** Seats per account. Shown for each plan; shared team accounts are not built. */
  maxUsers: number;
  /** Printable check report. */
  advancedReports: boolean;
  supportLevel: SupportLevel;
}

export interface Plan extends PlanFeatures {
  code: PlanCode;
  sortOrder: number;
  currency: "AZN";
  /** Price in qəpik, or null when the plan is not sold that way. */
  priceMonthlyMinor: number | null;
  priceAnnualMinor: number | null;
}

const FEATURES: Record<PlanCode, PlanFeatures> = {
  free: { monthlyCheckLimit: 1, checkLimitPeriod: "once", advisorAccess: false, riskScoreAccess: true, historyDays: 30, maxUsers: 1, advancedReports: false, supportLevel: "community" },
  starter: { monthlyCheckLimit: 30, checkLimitPeriod: "month", advisorAccess: true, riskScoreAccess: true, historyDays: 180, maxUsers: 1, advancedReports: false, supportLevel: "email" },
  professional: { monthlyCheckLimit: 150, checkLimitPeriod: "month", advisorAccess: true, riskScoreAccess: true, historyDays: null, maxUsers: 5, advancedReports: true, supportLevel: "priority" },
  business: { monthlyCheckLimit: 1000, checkLimitPeriod: "month", advisorAccess: true, riskScoreAccess: true, historyDays: null, maxUsers: 20, advancedReports: true, supportLevel: "dedicated" },
};

/** Approved prices: Starter is paid per document; Premium (professional) and VIP (business) per month / year. */
const PRICES: Record<PlanCode, { monthly: number | null; annual: number | null }> = {
  free: { monthly: null, annual: null },
  starter: { monthly: null, annual: null },
  professional: { monthly: 6000, annual: 30000 },
  business: { monthly: 6000, annual: 60000 },
};

/** Starter: 3 AZN per document. */
export const SINGLE_CHECK_PRICE_MINOR = 300;

export function getPlans(): Plan[] {
  return PLAN_CODES.map((code, i) => ({
    code,
    sortOrder: i,
    currency: "AZN" as const,
    ...FEATURES[code],
    priceMonthlyMinor: PRICES[code].monthly,
    priceAnnualMinor: PRICES[code].annual,
  }));
}

export function getPlan(code: string): Plan | null {
  return getPlans().find((p) => p.code === code) ?? null;
}

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === "string" && (PLAN_CODES as readonly string[]).includes(value);
}

export function planPrice(plan: Plan, period: BillingPeriod): number | null {
  return period === "monthly" ? plan.priceMonthlyMinor : plan.priceAnnualMinor;
}
