import "server-only";

/**
 * Outgoing e-mail (password reset). Uses Resend's HTTP API when RESEND_API_KEY
 * and MAIL_FROM are set. Without them:
 *  - development: the message is printed to the server console so the flow can be tested;
 *  - production: nothing is sent and a warning is logged (configure a provider before launch).
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[dev mail] To: ${mail.to}\n[dev mail] Subject: ${mail.subject}\n${mail.text}\n`);
      return true;
    }
    console.warn("[mail] no e-mail provider configured; message not sent");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(`[mail] provider returned ${res.status}`);
    return res.ok;
  } catch {
    console.warn("[mail] provider request failed");
    return false;
  }
}
