import { getCurrentUser } from "@/lib/server/auth";
import { handler, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user (or null). Never includes the password hash or session data. */
export const GET = handler(async () => json({ user: await getCurrentUser() }));
