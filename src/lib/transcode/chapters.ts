import { type FfprobeChapter } from "./probe";

// ------------------------------------------------------------------
// Description chapter regex
// ------------------------------------------------------------------

// Matches lines like:
//   0:00 Intro
//   1:23 - Main section
//   1:23:45 – Part two
//   00:00 — Opening
//   0:00:01 Some title
// Groups:
//   [1] optional hours block including colon (e.g. "1:")
//   [2] minutes (1 or 2 digits)
//   [3] seconds (2 digits)
//   [4] title (anything after optional separator whitespace)
export const CHAPTER_REGEX = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[\s\-–—]+(\S.*?)\s*$/;

export type ParsedChapter = {
    startSec: number;
    title: string;
    source: "description" | "container";
};

// Parse chapters from a video description. Returns an empty array if no
// timestamps match. The first chapter must begin at 00:00 for the list to be
// considered valid (YouTube convention); if it does not, we discard the result.
export const parseDescriptionChapters = (description: string): ParsedChapter[] => {
    const chapters: ParsedChapter[] = [];

    for (const line of description.split("\n")) {
        const match = CHAPTER_REGEX.exec(line);
        if (!match) continue;

        const hours = match[1] ? parseInt(match[1], 10) : 0;
        const minutes = parseInt(match[2] ?? "0", 10);
        const seconds = parseInt(match[3] ?? "0", 10);
        const title = (match[4] ?? "").trim();

        const startSec = hours * 3600 + minutes * 60 + seconds;
        chapters.push({ startSec, title, source: "description" });
    }

    if (chapters.length === 0) return [];

    // Sort ascending; first chapter must start at 0.
    chapters.sort((a, b) => a.startSec - b.startSec);
    if ((chapters[0]?.startSec ?? -1) !== 0) return [];

    return chapters;
};

// Convert ffprobe chapter list to our internal shape.
export const containerChapters = (raw: FfprobeChapter[]): ParsedChapter[] =>
    raw
        .map((c) => ({
            startSec: Math.round(parseFloat(c.start_time)),
            title: c.tags?.["title"] ?? `Chapter ${c.id + 1}`,
            source: "container" as const,
        }))
        .sort((a, b) => a.startSec - b.startSec);

// Merge container chapters with description chapters.
// Description chapters take precedence when both sources have a chapter at the
// same start time (creator intent over container metadata).
export const mergeChapters = (container: ParsedChapter[], description: ParsedChapter[]): ParsedChapter[] => {
    if (description.length > 0) {
        // Description wins entirely when it parses successfully (same YouTube
        // convention: a full description timestamp list replaces container chapters).
        return description;
    }
    return container;
};

// Compute endSec for each chapter (= next chapter's startSec, or undefined for
// the last). Returns chapters with endSec filled in.
export const withEndSec = (chapters: ParsedChapter[], durationSec: number): Array<ParsedChapter & { endSec: number }> =>
    chapters.map((ch, i) => ({
        ...ch,
        endSec: chapters[i + 1]?.startSec ?? Math.ceil(durationSec),
    }));
