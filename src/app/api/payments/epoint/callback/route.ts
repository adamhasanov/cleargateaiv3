import { getDb } from "@/lib/server/db";
import { decodeData, epointConfig, verify, type EpointNotice } from "@/lib/payments/epoint";
import { applyProviderNotice } from "@/lib/payments/service";
import { PAYMENT_PROVIDER } from "@/lib/payments/provider";

export const runtime = "nodejs";

/**
 * Epoint result_url (webhook). Configure in the Epoint merchant cabinet:
 *   https://<your-domain>/api/payments/epoint/callback
 * Authenticated by signature (no cookies, no same-origin check). Safe to receive twice.
 */
export async function POST(request: Request) {
  const cfg = epointConfig();
  if (!cfg) return Response.json({ error: "paymentsNotConfigured" }, { status: 503 });

  let data = "", signature = "";
  try {
    const form = await request.formData();
    data = String(form.get("data") ?? "");
    signature = String(form.get("signature") ?? "");
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }
  const db = await getDb();
  if (!data || data.length > 20_000 || !verify(cfg.privateKey, data, signature)) {
    await db.query(
      `INSERT INTO payment_events (payment_id, provider, source, provider_status, signature_valid) VALUES (NULL, $1, 'callback', NULL, false)`,
      [PAYMENT_PROVIDER],
    );
    console.warn("[payments] callback with an invalid signature rejected");
    return Response.json({ error: "invalidSignature" }, { status: 400 });
  }
  const notice = decodeData<EpointNotice>(data);
  if (!notice?.order_id) return Response.json({ error: "badRequest" }, { status: 400 });

  const payment = await applyProviderNotice(db, String(notice.order_id), notice, "callback");
  if (!payment) console.warn("[payments] callback for an unknown order");
  return Response.json({ ok: true });
}
