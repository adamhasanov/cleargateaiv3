"use client";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; extra: Record<string, unknown> };

/** Same-origin JSON request to our API. Never throws; errors come back as stable codes. */
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, data: json as T };
    const { error, ...extra } = json;
    return { ok: false, status: res.status, error: typeof error === "string" ? error : "serverError", extra };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return { ok: false, status: 0, error: "network", extra: {} };
  }
}

/** Translates an API error code with the portal error texts (falls back to a generic message). */
export function errorText(errors: Record<string, string>, code: string): string {
  return errors[code] ?? errors.generic;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
