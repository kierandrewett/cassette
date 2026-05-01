import { describe, it, expect, beforeEach } from "vitest";
import { limit, resetBucket, ipFromHeaders } from "@/lib/ratelimit";

// ---------------------------------------------------------------------------
// Reset shared bucket state between tests by using unique keys per scenario.
// ---------------------------------------------------------------------------

let seq = 0;
const uniqueKey = (): string => `test-route-${++seq}`;

describe("ratelimit — token bucket", () => {
    it("allows requests within budget", () => {
        const key = uniqueKey();
        const result1 = limit({ key, identifier: "user-1", windowMs: 60_000, max: 3 });
        const result2 = limit({ key, identifier: "user-1", windowMs: 60_000, max: 3 });
        const result3 = limit({ key, identifier: "user-1", windowMs: 60_000, max: 3 });

        expect(result1.allowed).toBe(true);
        expect(result1.remaining).toBe(2);
        expect(result2.allowed).toBe(true);
        expect(result2.remaining).toBe(1);
        expect(result3.allowed).toBe(true);
        expect(result3.remaining).toBe(0);
    });

    it("denies the request after the budget is exhausted", () => {
        const key = uniqueKey();
        for (let i = 0; i < 3; i++) {
            limit({ key, identifier: "user-2", windowMs: 60_000, max: 3 });
        }
        const denied = limit({ key, identifier: "user-2", windowMs: 60_000, max: 3 });
        expect(denied.allowed).toBe(false);
        expect(denied.remaining).toBe(0);
    });

    it("keeps per-identifier isolation", () => {
        const key = uniqueKey();
        for (let i = 0; i < 5; i++) {
            limit({ key, identifier: "user-a", windowMs: 60_000, max: 5 });
        }
        // user-b should still have a fresh bucket
        const result = limit({ key, identifier: "user-b", windowMs: 60_000, max: 5 });
        expect(result.allowed).toBe(true);
    });

    it("resets after the window expires", () => {
        const key = uniqueKey();
        // Fill up with a 0ms window so it expires immediately
        limit({ key, identifier: "user-3", windowMs: 0, max: 1 });
        limit({ key, identifier: "user-3", windowMs: 0, max: 1 });
        // The next call opens a fresh window because windowMs=0 means the
        // previous window has already expired when evaluated.
        const result = limit({ key, identifier: "user-3", windowMs: 0, max: 1 });
        expect(result.allowed).toBe(true);
    });

    it("reports a sensible resetAt timestamp", () => {
        const key = uniqueKey();
        const before = Date.now();
        const { resetAt } = limit({ key, identifier: "user-4", windowMs: 30_000, max: 10 });
        const after = Date.now();
        const resetMs = resetAt.getTime();
        expect(resetMs).toBeGreaterThanOrEqual(before + 30_000);
        expect(resetMs).toBeLessThanOrEqual(after + 30_000);
    });

    it("resetBucket clears accumulated count", () => {
        const key = uniqueKey();
        for (let i = 0; i < 5; i++) {
            limit({ key, identifier: "user-5", windowMs: 60_000, max: 5 });
        }
        const denied = limit({ key, identifier: "user-5", windowMs: 60_000, max: 5 });
        expect(denied.allowed).toBe(false);

        resetBucket(key, "user-5");

        const allowed = limit({ key, identifier: "user-5", windowMs: 60_000, max: 5 });
        expect(allowed.allowed).toBe(true);
    });

    it("keeps per-key isolation (same identifier, different keys)", () => {
        const keyA = uniqueKey();
        const keyB = uniqueKey();
        for (let i = 0; i < 5; i++) {
            limit({ key: keyA, identifier: "user-6", windowMs: 60_000, max: 5 });
        }
        const result = limit({ key: keyB, identifier: "user-6", windowMs: 60_000, max: 5 });
        expect(result.allowed).toBe(true);
    });
});

describe("ipFromHeaders", () => {
    it("extracts the first IP from x-forwarded-for", () => {
        const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
        expect(ipFromHeaders(headers)).toBe("1.2.3.4");
    });

    it("returns 'unknown' when the header is absent", () => {
        const headers = new Headers();
        expect(ipFromHeaders(headers)).toBe("unknown");
    });

    it("handles a single IP without a comma", () => {
        const headers = new Headers({ "x-forwarded-for": "9.9.9.9" });
        expect(ipFromHeaders(headers)).toBe("9.9.9.9");
    });
});
