// LOCAL TEST GATEWAY for development only — implements Epoint's protocol
// (signed /api/1/request, /api/1/get-status and the signed result_url callback)
// so payment success, failure and pending states can be tested end to end.
// No card data is collected and no money moves. Never point production at it.
//
//   npm run epoint:sandbox
//   .env.local:  EPOINT_BASE_URL=http://localhost:8181
//                EPOINT_PUBLIC_KEY=i000000001
//                EPOINT_PRIVATE_KEY=sandbox-private-key-change-me
//
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.EPOINT_SANDBOX_PORT ?? 8181);
const PUBLIC_KEY = process.env.EPOINT_PUBLIC_KEY ?? "i000000001";
const PRIVATE_KEY = process.env.EPOINT_PRIVATE_KEY ?? "sandbox-private-key-change-me";
const RESULT_URL = process.env.EPOINT_SANDBOX_RESULT_URL ?? "http://localhost:3000/api/payments/epoint/callback";

const sign = (data) => createHash("sha1").update(PRIVATE_KEY + data + PRIVATE_KEY, "utf8").digest("base64");
const encode = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
const decode = (data) => JSON.parse(Buffer.from(data, "base64").toString("utf8"));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** transaction → { order_id, amount, currency, description, success, error, status } */
const transactions = new Map();
let seq = 0;

async function readForm(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function signedParams(form) {
  const data = form.get("data") ?? "";
  if (sign(data) !== form.get("signature")) return null;
  const params = decode(data);
  return params.public_key === PUBLIC_KEY ? params : null;
}

function notice(tx, t) {
  return {
    order_id: t.order_id, status: t.status, code: t.status === "success" ? "000" : t.status === "new" ? "" : "116",
    message: t.status === "success" ? "Approved" : t.status === "new" ? "Pending" : "Declined (test gateway)",
    transaction: tx, bank_transaction: `TEST-${tx}`, operation_code: "100", amount: Number(t.amount),
    trace_id: createHash("md5").update(tx + t.status).digest("hex"),
  };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "POST" && url.pathname === "/api/1/request") {
      const p = signedParams(await readForm(req));
      if (!p) return send(res, 200, { status: "error", message: "Invalid signature or public key", trace_id: "sandbox" });
      for (const k of ["amount", "currency", "language", "order_id"]) {
        if (p[k] === undefined || p[k] === "") return send(res, 200, { status: "error", message: `Missing ${k}`, trace_id: "sandbox" });
      }
      const tx = `te_sandbox_${Date.now()}_${++seq}`;
      transactions.set(tx, { order_id: p.order_id, amount: p.amount, currency: p.currency, description: p.description ?? "", success: p.success_redirect_url, error: p.error_redirect_url, status: "new" });
      return send(res, 200, { status: "success", redirect_url: `http://localhost:${PORT}/pay/${tx}`, transaction: tx, trace_id: "sandbox" });
    }

    if (req.method === "POST" && url.pathname === "/api/1/get-status") {
      const p = signedParams(await readForm(req));
      const t = p && transactions.get(p.transaction);
      if (!t) return send(res, 200, { status: "error", message: "Unknown transaction" });
      return send(res, 200, notice(p.transaction, t));
    }

    const m = url.pathname.match(/^\/pay\/([\w-]+)$/);
    if (m && transactions.has(m[1])) {
      const tx = m[1];
      const t = transactions.get(tx);
      if (req.method === "POST") {
        const action = (await readForm(req)).get("action");
        if (t.status === "new" && (action === "approve" || action === "decline")) {
          t.status = action === "approve" ? "success" : "failed";
          const data = encode(notice(tx, t));
          // Deliver the signed callback like Epoint does, then send the customer back.
          await fetch(RESULT_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data, signature: sign(data) }) })
            .then((r) => console.log(`[sandbox] callback ${t.status} → ${r.status}`))
            .catch((e) => console.log(`[sandbox] callback failed: ${e.message}`));
        }
        res.writeHead(303, { Location: t.status === "success" ? t.success : t.error });
        return res.end();
      }
      return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TEST payment gateway</title>
<body style="font:16px system-ui;background:#061d27;color:#eaf4f5;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<main style="max-width:420px;width:100%;background:#0d2f3b;border:1px solid #1f4a57;border-radius:14px;padding:24px">
<p style="background:#f2b544;color:#1a1300;padding:8px 12px;border-radius:8px;font-weight:700;margin:0 0 16px">TEST GATEWAY — no real card, no real money</p>
<h1 style="font-size:22px;margin:0 0 8px">${esc(Number(t.amount).toFixed(2))} ${esc(t.currency)}</h1>
<p style="color:#9fb7bd;margin:0 0 20px">${esc(t.description)}<br>Order ${esc(t.order_id)}</p>
<form method="post" style="display:grid;gap:10px">
<button name="action" value="approve" style="padding:14px;border:0;border-radius:10px;background:#00d6c3;color:#04222a;font-weight:700;font-size:16px">Approve (simulate success)</button>
<button name="action" value="decline" style="padding:14px;border:1px solid #e45b5b;border-radius:10px;background:transparent;color:#f08a8a;font-weight:700;font-size:16px">Decline (simulate failure)</button>
<a href="${esc(t.error)}" style="text-align:center;color:#9fb7bd;padding:10px">Leave without paying (stays pending)</a>
</form></main></body>`, "text/html; charset=utf-8");
    }
    send(res, 404, { status: "error", message: "Not found" });
  } catch (e) {
    send(res, 500, { status: "server_error", message: String(e?.message ?? e) });
  }
}).listen(PORT, () => console.log(`Epoint TEST gateway on http://localhost:${PORT} (callbacks → ${RESULT_URL})`));
