// Parse a `Range: bytes=...` request header against a known content length.
// Returns a resolved byte range or a rejection reason.

export type ResolvedRange = {
    ok: true;
    start: number;
    end: number; // inclusive, clamped to total-1
    length: number; // end - start + 1
};

export type RangeReject = {
    ok: false;
    reason: string;
};

export type ParseRangeResult = ResolvedRange | RangeReject;

/**
 * Parse a single `Range: bytes=a-b` header value against `total` bytes.
 *
 * Handles:
 *   - `bytes=a-b`  : closed range
 *   - `bytes=a-`   : from a to end
 *   - `bytes=-n`   : last n bytes (suffix)
 *
 * Returns `{ ok: false }` for any syntactically invalid or unsatisfiable input.
 * Multi-range requests (`bytes=0-9,20-29`) are rejected (not implemented).
 */
export const parseRange = (header: string, total: number): ParseRangeResult => {
    const reject = (reason: string): RangeReject => ({ ok: false, reason });

    if (!header.startsWith("bytes=")) {
        return reject("Range unit must be 'bytes'");
    }

    const spec = header.slice("bytes=".length).trim();

    // Reject multi-range.
    if (spec.includes(",")) {
        return reject("Multi-range requests are not supported");
    }

    // Must match `a-b`, `a-`, or `-n`.
    const match = /^(\d*)-(\d*)$/.exec(spec);
    if (!match) {
        return reject("Invalid Range syntax");
    }

    const rawStart = match[1] ?? "";
    const rawEnd = match[2] ?? "";

    let start: number;
    let end: number;

    if (rawStart === "" && rawEnd === "") {
        return reject("Invalid Range syntax: both sides empty");
    }

    if (rawStart === "") {
        // Suffix form: `-n` means last n bytes.
        const n = parseInt(rawEnd, 10);
        if (!Number.isFinite(n) || n <= 0) {
            return reject("Invalid suffix length");
        }
        start = Math.max(0, total - n);
        end = total - 1;
    } else {
        start = parseInt(rawStart, 10);
        if (!Number.isFinite(start)) {
            return reject("Invalid start byte");
        }

        if (rawEnd === "") {
            // Open-ended: a- means from a to EOF.
            end = total - 1;
        } else {
            end = parseInt(rawEnd, 10);
            if (!Number.isFinite(end)) {
                return reject("Invalid end byte");
            }
            if (end < start) {
                return reject("Range end must be >= start");
            }
        }
    }

    // Clamp end to total-1 (as per RFC 9110 §14.1.2: the server may deliver
    // less than requested if the resource is shorter).
    end = Math.min(end, total - 1);

    if (start > total - 1) {
        return reject("Range start exceeds resource size");
    }

    return { ok: true, start, end, length: end - start + 1 };
};
