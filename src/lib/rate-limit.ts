interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory sliding-window-ish rate limiter, keyed by caller.
 *
 * This is process-local: it resets on redeploy/restart and isn't shared
 * across multiple server instances or serverless invocations. That's fine
 * for a single Node server, but if this app is deployed behind multiple
 * instances/regions, replace this with a shared store (e.g. Upstash
 * Redis) — the call sites (`checkRateLimit(key, opts)`) don't need to
 * change, only this implementation.
 */
const buckets = new Map<string, Bucket>();

const MAX_TRACKED_KEYS = 10_000;

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): { allowed: boolean; remaining: number } {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1 };
  }

  bucket.count += 1;
  if (bucket.count > opts.limit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: opts.limit - bucket.count };
}
