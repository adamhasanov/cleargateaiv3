import "server-only";
import { addPeriod, getPlan, planPrice, singleCheckPrice, type BillingPeriod, type PaidPlanCode } from "@/lib/billing/plans";
import type { Db, Queryable } from "@/lib/server/db";
import { HttpError } from "@/lib/server/http";
import { createPayment as epointCreate, epointConfig, getStatus as epointStatus, mapStatus, type EpointNotice } from "./epoint";
import { PAYMENT_PROVIDER } from "./provider";

export type PaymentStatus = "pending" | "succeeded" | "failed";

export interface PaymentRecord {
  id: string;
  purpose: "check_credit" | "subscription";
  planCode: PaidPlanCode | null;
  billingPeriod: BillingPeriod | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PaymentRow {
  id: string; user_id: string; purpose: PaymentRecord["purpose"]; plan_code: PaidPlanCode | null; billing_period: BillingPeriod | null;
  amount_minor: number; currency: string; status: PaymentStatus; provider_transaction: string | null; checkout_url: string | null;
  failure_reason: string | null; created_at: Date; completed_at: Date | null;
}

export function toPaymentRecord(r: PaymentRow): PaymentRecord {
  return {
    id: r.id, purpose: r.purpose, planCode: r.plan_code, billingPeriod: r.billing_period, amountMinor: r.amount_minor,
    currency: r.currency, status: r.status, failureReason: r.failure_reason,
    createdAt: new Date(r.created_at).toISOString(), completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  };
}

export type PaymentRequest =
  | { purpose: "check_credit" }
  | { purpose: "subscription"; planCode: PaidPlanCode; billingPeriod: BillingPeriod };

/**
 * Creates a pending payment and the provider checkout. Duplicate protection:
 *  - the same idempotency key (one per click in the browser) returns the same payment;
 *  - an identical pending payment from the last 30 minutes is reused instead of opening a second charge.
 * Amounts come only from server configuration, never from the request.
 */
export async function startPayment(
  db: Db,
  user: { id: string; locale: "az" | "ru" | "en" },
  req: PaymentRequest,
  idempotencyKey: string,
  baseUrl: string,
  language: "az" | "ru" | "en",
): Promise<{ payment: PaymentRecord; checkoutUrl: string | null }> {
  const cfg = epointConfig();
  if (!cfg) throw new HttpError(503, "paymentsNotConfigured");

  let amountMinor: number | null;
  let description: string;
  if (req.purpose === "check_credit") {
    amountMinor = singleCheckPrice();
    description = "ClearGateAI document check";
  } else {
    const plan = getPlan(req.planCode);
    if (!plan || plan.code === "free") throw new HttpError(400, "invalidPlan");
    amountMinor = planPrice(plan, req.billingPeriod);
    description = `ClearGateAI ${plan.code} plan (${req.billingPeriod})`;
  }
  if (!amountMinor) throw new HttpError(409, "priceNotConfigured");
  const planCode = req.purpose === "subscription" ? req.planCode : null;
  const period = req.purpose === "subscription" ? req.billingPeriod : null;

  const existing = await db.query<PaymentRow>(
    `SELECT * FROM payments WHERE user_id = $1 AND (
        idempotency_key = $2 OR
        (status = 'pending' AND purpose = $3 AND plan_code IS NOT DISTINCT FROM $4 AND billing_period IS NOT DISTINCT FROM $5
         AND amount_minor = $6 AND checkout_url IS NOT NULL AND created_at > now() - interval '30 minutes'))
      ORDER BY (idempotency_key = $2) DESC, created_at DESC LIMIT 1`,
    [user.id, idempotencyKey, req.purpose, planCode, period, amountMinor],
  );
  if (existing.rows[0]) {
    const p = existing.rows[0];
    return { payment: toPaymentRecord(p), checkoutUrl: p.status === "pending" ? p.checkout_url : null };
  }

  const { rows } = await db.query<PaymentRow>(
    `INSERT INTO payments (user_id, purpose, plan_code, billing_period, amount_minor, currency, status, provider, order_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 'AZN', 'pending', $6, gen_random_uuid()::text, $7)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [user.id, req.purpose, planCode, period, amountMinor, PAYMENT_PROVIDER, idempotencyKey],
  );
  if (!rows[0]) {
    // Lost a race with the same key: return the winner.
    const again = await db.query<PaymentRow>(`SELECT * FROM payments WHERE user_id = $1 AND idempotency_key = $2`, [user.id, idempotencyKey]);
    return { payment: toPaymentRecord(again.rows[0]), checkoutUrl: again.rows[0].checkout_url };
  }
  const payment = rows[0];
  await db.query(`UPDATE payments SET order_id = id::text WHERE id = $1`, [payment.id]);

  const returnUrl = `${baseUrl}/${language}/payments/${payment.id}`;
  let created: Awaited<ReturnType<typeof epointCreate>>;
  try {
    created = await epointCreate(cfg, {
      amountMinor, currency: "AZN", language, orderId: payment.id, description, successUrl: returnUrl, errorUrl: returnUrl,
    });
  } catch {
    created = { ok: false, message: "provider unreachable" };
  }
  if (!created.ok) {
    await db.query(
      `UPDATE payments SET status = 'failed', failure_reason = $2, updated_at = now(), completed_at = now() WHERE id = $1`,
      [payment.id, `provider: ${created.message}`],
    );
    throw new HttpError(502, "paymentProviderError");
  }
  const { rows: updated } = await db.query<PaymentRow>(
    `UPDATE payments SET provider_transaction = $2, checkout_url = $3, updated_at = now() WHERE id = $1 RETURNING *`,
    [payment.id, created.transaction, created.redirectUrl],
  );
  return { payment: toPaymentRecord(updated[0]), checkoutUrl: created.redirectUrl };
}

/** What a succeeded payment buys. Idempotent: guarded by the payment's own pending → succeeded transition. */
async function fulfil(tx: Queryable, p: PaymentRow): Promise<void> {
  if (p.purpose === "check_credit") {
    await tx.query(`INSERT INTO check_credits (user_id, payment_id) VALUES ($1, $2) ON CONFLICT (payment_id) DO NOTHING`, [p.user_id, p.id]);
    return;
  }
  const period = p.billing_period!;
  await tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [p.user_id]);
  await tx.query(
    `UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE user_id = $1 AND status = 'active' AND current_period_end <= now()`,
    [p.user_id],
  );
  const { rows } = await tx.query<{ id: string; plan_code: string; current_period_end: Date }>(
    `SELECT id, plan_code, current_period_end FROM subscriptions WHERE user_id = $1 AND status = 'active' FOR UPDATE`,
    [p.user_id],
  );
  const active = rows[0];
  if (active && active.plan_code === p.plan_code) {
    // Renewal: the new period starts when the current one ends.
    const end = addPeriod(new Date(active.current_period_end), period);
    await tx.query(
      `UPDATE subscriptions SET current_period_end = $2, billing_period = $3, cancel_at_period_end = false, updated_at = now() WHERE id = $1`,
      [active.id, end, period],
    );
    return;
  }
  if (active) {
    // Plan change (upgrade or downgrade): the paid new plan starts now; the old one ends. No proration.
    await tx.query(`UPDATE subscriptions SET status = 'canceled', current_period_end = GREATEST(current_period_start + interval '1 second', now()), updated_at = now() WHERE id = $1`, [active.id]);
  }
  const start = new Date();
  await tx.query(
    `INSERT INTO subscriptions (user_id, plan_code, billing_period, status, current_period_start, current_period_end)
     VALUES ($1, $2, $3, 'active', $4, $5)`,
    [p.user_id, p.plan_code, period, start, addPeriod(start, period)],
  );
}

/**
 * Applies a provider notice (signed callback or status query) to a payment.
 * Only pending payments change; a repeated or late notice is recorded and ignored,
 * so a payment is fulfilled at most once. The paid amount must match ours.
 */
export async function applyProviderNotice(
  db: Db,
  orderId: string,
  notice: EpointNotice,
  source: "callback" | "status_check",
): Promise<PaymentRecord | null> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<PaymentRow>(`SELECT * FROM payments WHERE order_id = $1 FOR UPDATE`, [orderId]);
    const p = rows[0];
    await tx.query(
      `INSERT INTO payment_events (payment_id, provider, source, provider_status, signature_valid) VALUES ($1, $2, $3, $4, true)`,
      [p?.id ?? null, PAYMENT_PROVIDER, source, String(notice.status ?? "").slice(0, 40)],
    );
    if (!p) return null;
    if (p.status !== "pending") return toPaymentRecord(p);
    if (notice.transaction && p.provider_transaction && notice.transaction !== p.provider_transaction) return toPaymentRecord(p);

    let next = mapStatus(notice.status);
    let reason: string | null = next === "failed" ? String(notice.message ?? notice.status ?? "failed").slice(0, 200) : null;
    if (next === "succeeded" && notice.amount !== undefined && Math.round(Number(notice.amount) * 100) !== p.amount_minor) {
      next = "failed";
      reason = "amount mismatch";
    }
    if (next === "pending") return toPaymentRecord(p);

    const { rows: updated } = await tx.query<PaymentRow>(
      `UPDATE payments SET status = $2, failure_reason = $3, provider_transaction = COALESCE(provider_transaction, $4),
              updated_at = now(), completed_at = now()
        WHERE id = $1 RETURNING *`,
      [p.id, next, reason, notice.transaction ?? null],
    );
    if (next === "succeeded") await fulfil(tx, updated[0]);
    return toPaymentRecord(updated[0]);
  });
}

/** A user's own payment; pending ones are reconciled with the provider first (covers a missed callback). */
export async function getPaymentForUser(db: Db, userId: string, paymentId: string): Promise<PaymentRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
  const { rows } = await db.query<PaymentRow>(`SELECT * FROM payments WHERE id = $1 AND user_id = $2`, [paymentId, userId]);
  const p = rows[0];
  if (!p) return null;
  const cfg = epointConfig();
  if (p.status === "pending" && p.provider_transaction && cfg) {
    try {
      const notice = await epointStatus(cfg, p.provider_transaction);
      const updated = await applyProviderNotice(db, p.id, { ...notice, transaction: notice.transaction ?? p.provider_transaction }, "status_check");
      if (updated) return updated;
    } catch {
      // Provider unreachable: report the stored state; the callback or a later poll will settle it.
    }
  }
  return toPaymentRecord(p);
}

export async function listPayments(db: Queryable, userId: string): Promise<PaymentRecord[]> {
  const { rows } = await db.query<PaymentRow>(`SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]);
  return rows.map(toPaymentRecord);
}
