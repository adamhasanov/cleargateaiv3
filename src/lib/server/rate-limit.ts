import "server-only";

/**
 * Tiny in-memory rate limiter (per server instance, best effort). With no
 * accounts in the MVP demo, this is what keeps the AI quota from being drained
 * by one client. Counts a request when it is allowed.
 */
const buckets = new Map<string, { count: number; start: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { count: 1, start: now });
    if (buckets.size > 10_000) buckets.clear();
    return true;
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
