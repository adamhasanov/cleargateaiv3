import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

/** JSON response that is never cached. */
export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Error codes are stable strings the interface translates; no internal details leak. */
export function fail(error: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return json({ error, ...extra }, status);
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly extra?: Record<string, unknown>) {
    super(code);
  }
}

/**
 * CSRF protection for state-changing requests: the browser's Origin must be
 * this site.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Some same-origin requests omit Origin; Sec-Fetch-Site tells us where they came from.
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "forbidden");
    return;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "forbidden");
  }
  if (!host || originHost !== host) throw new HttpError(403, "forbidden");
}

/** Parses and validates a JSON body; invalid input → 400 with the failing field names only. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T, maxBytes = 32_768): Promise<z.infer<T>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new HttpError(413, "tooLarge");
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBytes) throw new HttpError(413, "tooLarge");
    body = text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "badRequest");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalidInput", { fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))] });
  }
  return parsed.data;
}

/** Wraps a route handler: HttpError → its JSON response; anything else → a generic 500 (details logged, not returned). */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HttpError) return fail(error.code, error.status, error.extra);
      console.error("[api] unexpected error", error instanceof Error ? error.message : "unknown");
      return fail("serverError", 500);
    }
  };
}

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim();
}

