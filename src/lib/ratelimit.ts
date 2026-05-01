/**
 * In-memory token-bucket rate limiter.
 *
 * Keyed on `(routeKey, identifier)`. Identifier should be:
 *   - userId for authenticated routes
 *   - IP address for anonymous routes (read from x-forwarded-for or a constant)
 *
 * This is intentionally simple — no Redis, no distributed coordination.
 * Suitable for self-hosted single-process deployments. A future upgrade path
 * is to swap the in-memory Map for a Redis backend without changing callers.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitOptions {
    /** Arbitrary string identifying the route / action being limited. */
    key: string;
    /** User ID, IP address, or API-key ID. */
    identifier: string;
    /** Sliding window duration in milliseconds. */
    windowMs: number;
    /** Maximum number of requests permitted within the window. */
    max: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
}

// ---------------------------------------------------------------------------
// Internal bucket state
// ---------------------------------------------------------------------------

interface Bucket {
    count: number;
    windowStart: number;
}

// One map entry per composite key.
const buckets = new Map<string, Bucket>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Consume one token from the bucket identified by `(key, identifier)`.
 * Returns whether the request is allowed, how many tokens remain, and when
 * the current window resets.
 */
export function limit(opts: RateLimitOptions): RateLimitResult {
    const { key, identifier, windowMs, max } = opts;
    const compositeKey = `${key}::${identifier}`;
    const now = Date.now();

    let bucket = buckets.get(compositeKey);

    // If no bucket exists or the current window has expired, open a fresh one.
    if (!bucket || now - bucket.windowStart >= windowMs) {
        bucket = { count: 0, windowStart: now };
        buckets.set(compositeKey, bucket);
    }

    const resetAt = new Date(bucket.windowStart + windowMs);

    if (bucket.count >= max) {
        return { allowed: false, remaining: 0, resetAt };
    }

    bucket.count += 1;
    return { allowed: true, remaining: max - bucket.count, resetAt };
}

/**
 * Reset the bucket for `(key, identifier)`, clearing accumulated count.
 * Useful in tests or after a successful privileged operation.
 */
export function resetBucket(key: string, identifier: string): void {
    buckets.delete(`${key}::${identifier}`);
}

// ---------------------------------------------------------------------------
// IP extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract the best-effort client IP from request headers.
 * Falls back to a constant so rate limiting still applies even if the header
 * is absent (e.g. in local dev without a reverse proxy).
 */
export function ipFromHeaders(headers: Headers): string {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) {
        // x-forwarded-for may be a comma-separated list; take the first.
        const first = forwarded.split(",")[0]?.trim();
        if (first) return first;
    }
    return "unknown";
}
