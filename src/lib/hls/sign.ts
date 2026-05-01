import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";

// Default token lifetime: 4 hours.
const DEFAULT_TTL_SEC = 4 * 60 * 60;

// Payload embedded in every HLS access token.
export type TokenPayload = {
    v: string; // videoId
    u: string | null; // userId (null for unauthenticated viewers)
    exp: number; // Unix epoch seconds
};

// Encode a plain object to base64url JSON.
const toBase64url = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString("base64url");

// Decode base64url JSON; returns null if anything goes wrong.
const fromBase64url = (s: string): unknown => {
    try {
        return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    } catch {
        return null;
    }
};

const nowSec = (): number => Math.floor(Date.now() / 1000);

// Create an HMAC-SHA256 signature over the base64url-encoded payload string.
const computeSig = (payloadB64: string): Buffer =>
    createHmac("sha256", env.HLS_SIGNING_SECRET).update(payloadB64).digest();

/**
 * Issue a time-limited HLS access token.
 *
 * Format: `<base64url(payload)>.<base64url(sig)>`
 *
 * The payload JSON is the inner content: `{ v, u, exp }`.
 * The sig is HMAC-SHA256 over the base64url payload string (not the raw JSON).
 */
export const signToken = ({
    videoId,
    userId,
    ttlSec = DEFAULT_TTL_SEC,
}: {
    videoId: string;
    userId: string | null;
    ttlSec?: number;
}): string => {
    const payload: TokenPayload = {
        v: videoId,
        u: userId,
        exp: nowSec() + ttlSec,
    };
    const payloadB64 = toBase64url(payload);
    const sigB64 = computeSig(payloadB64).toString("base64url");
    return `${payloadB64}.${sigB64}`;
};

export type VerifyOk = { valid: true; userId: string | null };
export type VerifyFail = { valid: false; reason: string };
export type VerifyResult = VerifyOk | VerifyFail;

/**
 * Verify an HLS access token.
 *
 * Checks:
 * 1. Correct two-part structure.
 * 2. HMAC signature (timing-safe compare).
 * 3. Token has not expired.
 * 4. Token was issued for `expectedVideoId`.
 */
export const verifyToken = (token: string, expectedVideoId: string): VerifyResult => {
    const dot = token.indexOf(".");
    if (dot === -1) {
        return { valid: false, reason: "malformed token: missing separator" };
    }

    const payloadB64 = token.slice(0, dot);
    const providedSigB64 = token.slice(dot + 1);

    // Guard against second dot splitting the sig
    if (providedSigB64.includes(".")) {
        return { valid: false, reason: "malformed token: too many segments" };
    }

    // Verify signature timing-safely.
    const expected = computeSig(payloadB64);
    let provided: Buffer;
    try {
        provided = Buffer.from(providedSigB64, "base64url");
    } catch {
        return { valid: false, reason: "malformed token: bad base64url in sig" };
    }

    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        return { valid: false, reason: "invalid signature" };
    }

    // Decode payload.
    const raw = fromBase64url(payloadB64);
    if (!raw || typeof raw !== "object") {
        return { valid: false, reason: "malformed token: undecodable payload" };
    }

    const p = raw as Record<string, unknown>;
    if (typeof p["v"] !== "string" || typeof p["exp"] !== "number") {
        return { valid: false, reason: "malformed token: missing fields" };
    }

    // Check expiry.
    if ((p["exp"] as number) < nowSec()) {
        return { valid: false, reason: "token expired" };
    }

    // Check video binding.
    if (p["v"] !== expectedVideoId) {
        return { valid: false, reason: "token bound to different video" };
    }

    const u = p["u"];
    const userId = typeof u === "string" ? u : null;

    return { valid: true, userId };
};
