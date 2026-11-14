import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Epoint (epoint.az) payment gateway — Azerbaijani card acquiring (AZN, az/en/ru pages).
 *
 * Protocol (developer.epoint.az): every request is a form POST with
 *   data      = base64(JSON parameters)
 *   signature = base64(sha1_raw(private_key + data + private_key))
 * The same pair is POSTed to the merchant's result_url (configured in the
 * Epoint merchant cabinet) when a payment completes.
 *
 * Card details are entered only on the bank's page; this code never sees them.
 */

export interface EpointConfig {
  publicKey: string;
  privateKey: string;
  /** https://epoint.az in production; the local test gateway (scripts/epoint-sandbox.mjs) in development. */
  baseUrl: string;
}

export function epointConfig(env: Record<string, string | undefined> = process.env): EpointConfig | null {
  const publicKey = env.EPOINT_PUBLIC_KEY?.trim();
  const privateKey = env.EPOINT_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, baseUrl: (env.EPOINT_BASE_URL?.trim() || "https://epoint.az").replace(/\/$/, "") };
}

export function encodeData(params: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(params), "utf8").toString("base64");
}

export function sign(privateKey: string, data: string): string {
  return createHash("sha1").update(privateKey + data + privateKey, "utf8").digest("base64");
}

/** Constant-time comparison of a received signature with the expected one. */
export function verify(privateKey: string, data: string, signature: string): boolean {
  const expected = Buffer.from(sign(privateKey, data));
  const actual = Buffer.from(signature ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function decodeData<T = Record<string, unknown>>(data: string): T | null {
  try {
    return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Epoint transaction statuses (callbacks and get-status). */
export type EpointStatus = "new" | "success" | "returned" | "failed" | "error" | "server_error";

/** Our payment state for an Epoint status. "new" stays pending; "returned" (refund) is not a successful payment. */
export function mapStatus(status: string | undefined): "pending" | "succeeded" | "failed" {
  if (status === "success") return "succeeded";
  if (status === "new" || status === undefined) return "pending";
  return "failed";
}

export interface EpointNotice {
  order_id?: string;
  status?: EpointStatus;
  code?: string;
  message?: string;
  transaction?: string;
  bank_transaction?: string;
  operation_code?: string;
  amount?: number | string;
}

async function post<T>(cfg: EpointConfig, path: string, params: Record<string, unknown>): Promise<T> {
  const data = encodeData({ public_key: cfg.publicKey, ...params });
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data, signature: sign(cfg.privateKey, data) }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as T | null;
  if (!body) throw new Error(`epoint ${path}: HTTP ${res.status}`);
  return body;
}

export interface CreatePaymentParams {
  amountMinor: number;
  currency: "AZN";
  language: "az" | "en" | "ru";
  orderId: string;
  description: string;
  successUrl: string;
  errorUrl: string;
}

/** POST /api/1/request — returns the bank page to send the customer to. */
export async function createPayment(cfg: EpointConfig, p: CreatePaymentParams): Promise<{ ok: true; redirectUrl: string; transaction: string } | { ok: false; message: string }> {
  const res = await post<{ status?: string; redirect_url?: string; transaction?: string; message?: string }>(cfg, "/api/1/request", {
    amount: (p.amountMinor / 100).toFixed(2),
    currency: p.currency,
    language: p.language,
    order_id: p.orderId,
    description: p.description.slice(0, 1000),
    success_redirect_url: p.successUrl,
    error_redirect_url: p.errorUrl,
  });
  if (res.status === "success" && res.redirect_url && res.transaction) {
    return { ok: true, redirectUrl: res.redirect_url, transaction: res.transaction };
  }
  return { ok: false, message: String(res.message ?? "request failed").slice(0, 200) };
}

/** POST /api/1/get-status — authoritative status for reconciliation (e.g. a missed callback). */
export async function getStatus(cfg: EpointConfig, transaction: string): Promise<EpointNotice> {
  return post<EpointNotice>(cfg, "/api/1/get-status", { transaction });
}
