import { destroyCurrentSession } from "@/lib/server/auth";
import { assertSameOrigin, handler, json } from "@/lib/server/http";

export const runtime = "nodejs";

export const POST = handler(async (request: Request) => {
  assertSameOrigin(request);
  await destroyCurrentSession();
  return json({ ok: true });
});
