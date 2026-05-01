/**
 * Pure VTT parser — no external dependencies.
 *
 * Input:  raw WebVTT text (may start with a UTF-8 BOM).
 * Output: ordered array of cue objects with numeric start/end times and
 *         plain-text content (HTML/voice tags stripped).
 *
 * Handles:
 *   - BOM (﻿) at the start of the file
 *   - WEBVTT header line (required by spec but tolerated if missing)
 *   - NOTE, STYLE, REGION blocks — skipped entirely
 *   - Cue timings in both `h:mm:ss.ms` and `m:ss.ms` forms
 *   - Multi-line cue text joined with a single space
 *   - Cue settings on the timing line — ignored
 *   - HTML/voice tags (`<v Speaker>`, `<i>`, `<b>`, `<c>`, etc.)
 *   - Malformed timing lines — those cue blocks are dropped silently
 *   - Empty / whitespace-only input
 */

export interface VttCue {
    startSec: number;
    endSec: number;
    text: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse a VTT timestamp (`hh:mm:ss.ms` or `mm:ss.ms`) to seconds. */
const parseTimeSec = (ts: string): number | null => {
    // Trim surrounding whitespace that can appear on timing lines.
    const clean = ts.trim();

    // Long form: hh:mm:ss.ms  (hours explicit)
    const longMatch = /^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/.exec(clean);
    if (longMatch) {
        const h = longMatch[1]!;
        const m = longMatch[2]!;
        const s = longMatch[3]!;
        const ms = longMatch[4]!;
        return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms.padEnd(3, "0"), 10) / 1000;
    }

    // Short form: mm:ss.ms  (no explicit hours)
    const shortMatch = /^(\d+):(\d{2})\.(\d{1,3})$/.exec(clean);
    if (shortMatch) {
        const m = shortMatch[1]!;
        const s = shortMatch[2]!;
        const ms = shortMatch[3]!;
        return parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms.padEnd(3, "0"), 10) / 1000;
    }

    return null;
};

/** Strip all WebVTT / HTML inline tags, leaving plain text. */
const stripTags = (raw: string): string =>
    // Remove everything between < and > (greedy-off so nested tags work).
    raw.replace(/<[^>]*>/g, "").trim();

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw WebVTT string and return an array of cues sorted by start time.
 * Returns an empty array for empty / invalid input.
 */
export const parseVtt = (raw: string): VttCue[] => {
    if (!raw || typeof raw !== "string") return [];

    // Strip UTF-8 BOM if present.
    const text = raw.startsWith("﻿") ? raw.slice(1) : raw;

    // Normalise line endings.
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    const cues: VttCue[] = [];
    let i = 0;

    // Skip the WEBVTT header line (and any header metadata lines that follow
    // before the first blank line).
    if (lines[0]?.trimStart().startsWith("WEBVTT")) {
        i++;
        // Advance past any non-blank header extension lines.
        while (i < lines.length && lines[i]!.trim() !== "") i++;
    }

    // Walk the remaining blocks, separated by one or more blank lines.
    while (i < lines.length) {
        // Skip blank lines between blocks.
        if (lines[i]!.trim() === "") {
            i++;
            continue;
        }

        // Peek at the block to detect NOTE / STYLE / REGION — skip them.
        const firstLine = lines[i]!.trim();
        if (firstLine.startsWith("NOTE") || firstLine.startsWith("STYLE") || firstLine.startsWith("REGION")) {
            // Consume until the next blank line.
            while (i < lines.length && lines[i]!.trim() !== "") i++;
            continue;
        }

        // A cue block starts with either:
        //   (a) an optional cue identifier line (not containing "-->")
        //   (b) a timing line containing "-->"
        let timingLine: string | null = null;

        if (firstLine.includes("-->")) {
            // No identifier — the first line is the timing line.
            timingLine = firstLine;
            i++;
        } else {
            // Potential cue identifier — skip it and look at the next line.
            i++;
            if (i < lines.length && lines[i]!.includes("-->")) {
                timingLine = lines[i]!.trim();
                i++;
            } else {
                // Not a recognised block — skip to next blank-line boundary.
                while (i < lines.length && lines[i]!.trim() !== "") i++;
                continue;
            }
        }

        // Parse the timing line.  Format:
        //   <start> --> <end> [<settings>]
        const arrowIdx = timingLine.indexOf("-->");
        if (arrowIdx === -1) {
            // Malformed — skip to end of block.
            while (i < lines.length && lines[i]!.trim() !== "") i++;
            continue;
        }

        const startStr = timingLine.slice(0, arrowIdx).trim();
        // End timestamp is everything between "-->" and the first space-delimited
        // cue setting (position, align, line, etc.).
        const afterArrow = timingLine.slice(arrowIdx + 3).trim();
        const endStr = afterArrow.split(/\s+/)[0] ?? "";

        const startSec = parseTimeSec(startStr);
        const endSec = parseTimeSec(endStr);

        if (startSec === null || endSec === null) {
            // Malformed timing — skip to end of block.
            while (i < lines.length && lines[i]!.trim() !== "") i++;
            continue;
        }

        // Collect cue payload lines (until next blank line or end of input).
        const payloadLines: string[] = [];
        while (i < lines.length && lines[i]!.trim() !== "") {
            payloadLines.push(lines[i]!);
            i++;
        }

        if (payloadLines.length === 0) {
            // Empty cue — skip.
            continue;
        }

        // Join multi-line payloads with a single space, then strip tags.
        const rawText = payloadLines.join(" ");
        const plainText = stripTags(rawText);

        if (plainText === "") continue;

        cues.push({ startSec, endSec, text: plainText });
    }

    // Sort by start time (most VTT files are already sorted, but be safe).
    cues.sort((a, b) => a.startSec - b.startSec);

    return cues;
};
