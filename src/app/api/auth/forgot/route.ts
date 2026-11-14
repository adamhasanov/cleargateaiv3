import { allowAttempt, newToken, recordFailure, sha256 } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { appBaseUrl, assertSameOrigin, clientIp, fail, handler, json, readJson } from "@/lib/server/http";
import { sendMail } from "@/lib/server/mail";
import { forgotSchema } from "@/lib/validation";

export const runtime = "nodejs";

const RESET_MINUTES = 60;

const MAIL = {
  az: { subject: "ClearGateAI — şifrənin bərpası", body: (link: string) => `Şifrənizi yeniləmək üçün bu keçidi açın (${RESET_MINUTES} dəqiqə etibarlıdır):\n${link}\n\nBu sorğunu siz göndərməmisinizsə, bu məktubu nəzərə almayın.` },
  ru: { subject: "ClearGateAI — восстановление пароля", body: (link: string) => `Чтобы задать новый пароль, откройте ссылку (действует ${RESET_MINUTES} минут):\n${link}\n\nЕсли вы не запрашивали сброс, просто проигнорируйте это письмо.` },
  en: { subject: "ClearGateAI — reset your password", body: (link: string) => `Open this link to set a new password (valid for ${RESET_MINUTES} minutes):\n${link}\n\nIf you did not ask for this, you can ignore this e-mail.` },
} as const;

/** Always answers the same way, so it cannot be used to find out which e-mails have accounts. */
export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  const { email, locale } = await readJson(request, forgotSchema);
  const key = `reset|${clientIp(request)}`;
  if (!allowAttempt(key)) return fail("tooManyAttempts", 429);
  recordFailure(key); // counts every request: max 10 reset e-mails per 15 minutes per IP

  const db = await getDb();
  const { rows } = await db.query<{ id: string; locale: "az" | "ru" | "en" }>(`SELECT id, locale FROM users WHERE lower(email) = $1`, [email]);
  const user = rows[0];
  if (user) {
    const token = newToken();
    await db.query(`DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
    await db.query(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [sha256(token), user.id, RESET_MINUTES],
    );
    const lang = locale ?? user.locale;
    const link = `${appBaseUrl(request)}/${lang}/reset-password?token=${encodeURIComponent(token)}`;
    await sendMail({ to: email, subject: MAIL[lang].subject, text: MAIL[lang].body(link) });
  }
  return json({ ok: true });
});
