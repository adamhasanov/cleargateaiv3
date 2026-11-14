import { getDb } from "@/lib/server/db";
import { assertSameOrigin, handler, json, readJson, requireUser } from "@/lib/server/http";
import { profileSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const PATCH = handler(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { name, locale } = await readJson(request, profileSchema);
  await (await getDb()).query(`UPDATE users SET name = $1, locale = $2, updated_at = now() WHERE id = $3`, [name, locale, user.id]);
  return json({ user: { ...user, name, locale } });
});
