import type { Queryable } from "@/lib/server/db";
import { getPlans } from "./plans";

/** Mirrors the code-defined plan catalogue (and env prices) into the plans table, so rows can reference it. */
export async function syncPlans(db: Queryable): Promise<void> {
  for (const p of getPlans()) {
    await db.query(
      `INSERT INTO plans (code, sort_order, monthly_check_limit, advisor_access, risk_score_access, history_days,
                          max_users, advanced_reports, support_level, price_monthly_minor, price_annual_minor, currency, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (code) DO UPDATE SET
         sort_order = EXCLUDED.sort_order, monthly_check_limit = EXCLUDED.monthly_check_limit,
         advisor_access = EXCLUDED.advisor_access, risk_score_access = EXCLUDED.risk_score_access,
         history_days = EXCLUDED.history_days, max_users = EXCLUDED.max_users,
         advanced_reports = EXCLUDED.advanced_reports, support_level = EXCLUDED.support_level,
         price_monthly_minor = EXCLUDED.price_monthly_minor, price_annual_minor = EXCLUDED.price_annual_minor,
         currency = EXCLUDED.currency, updated_at = now()`,
      [p.code, p.sortOrder, p.monthlyCheckLimit, p.advisorAccess, p.riskScoreAccess, p.historyDays,
       p.maxUsers, p.advancedReports, p.supportLevel, p.priceMonthlyMinor, p.priceAnnualMinor, p.currency],
    );
  }
}
