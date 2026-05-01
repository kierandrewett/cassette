"use client";

import { useState } from "react";
import { dispatchSeek } from "@/lib/player/store";
import { cn } from "@/lib/utils";

interface DescriptionClientProps {
    text: string;
}

// Regex patterns for auto-linking.
const TIMESTAMP_RE = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;
const URL_RE = /https?:\/\/[^\s<>"]+/g;

type Segment =
    | { type: "text"; content: string }
    | { type: "timestamp"; content: string; seconds: number }
    | { type: "url"; content: string };

const parseSegments = (text: string): Segment[] => {
    const segments: Segment[] = [];
    let pos = 0;

    type RawMatch = { index: number; length: number; type: "timestamp" | "url"; content: string; seconds?: number };
    const matches: RawMatch[] = [];

    TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIMESTAMP_RE.exec(text)) !== null) {
        const [full, hours, minutes, secs] = m;
        const h = hours ? parseInt(hours, 10) : 0;
        const seconds = h * 3600 + parseInt(minutes!, 10) * 60 + parseInt(secs!, 10);
        matches.push({ index: m.index, length: full.length, type: "timestamp", content: full, seconds });
    }

    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
        const overlaps = matches.some(
            (mx) => m!.index < mx.index + mx.length && m!.index + m![0].length > mx.index,
        );
        if (!overlaps) {
            matches.push({ index: m.index, length: m[0].length, type: "url", content: m[0] });
        }
    }

    matches.sort((a, b) => a.index - b.index);

    for (const match of matches) {
        if (match.index > pos) {
            segments.push({ type: "text", content: text.slice(pos, match.index) });
        }
        if (match.type === "timestamp") {
            segments.push({ type: "timestamp", content: match.content, seconds: match.seconds! });
        } else {
            segments.push({ type: "url", content: match.content });
        }
        pos = match.index + match.length;
    }

    if (pos < text.length) {
        segments.push({ type: "text", content: text.slice(pos) });
    }

    return segments;
};

/**
 * Client-side description renderer. Timestamps are rendered as buttons that
 * dispatch a seek event to the player. URLs are rendered as external links.
 * Long descriptions are clamped with a "Show more" toggle.
 */
export const DescriptionClient = ({ text }: DescriptionClientProps) => {
    const [expanded, setExpanded] = useState(false);
    const segments = parseSegments(text);

    const lineCount = text.split("\n").length;
    const needsClamp = lineCount > 5 || text.length > 280;

    const renderSegment = (seg: Segment, i: number) => {
        if (seg.type === "timestamp") {
            return (
                <button
                    key={i}
                    onClick={() => dispatchSeek(seg.seconds)}
                    className="font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                    aria-label={`Seek to ${seg.content}`}
                >
                    {seg.content}
                </button>
            );
        }

        if (seg.type === "url") {
            return (
                <a
                    key={i}
                    href={seg.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 hover:underline transition-colors break-all"
                >
                    {seg.content}
                </a>
            );
        }

        // Plain text: preserve newlines.
        return seg.content.split("\n").map((line, j, arr) => (
            <span key={`${i}-${j}`}>
                {line}
                {j < arr.length - 1 && <br />}
            </span>
        ));
    };

    return (
        <div className="text-sm text-foreground/90 leading-relaxed">
            <div
                className={cn(
                    "whitespace-pre-wrap break-words transition-all",
                    needsClamp && !expanded && "line-clamp-5",
                )}
            >
                {segments.map(renderSegment)}
            </div>

            {needsClamp && (
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-2 text-sm font-medium text-foreground/60 hover:text-foreground transition-colors"
                >
                    {expanded ? "Show less" : "Show more"}
                </button>
            )}
        </div>
    );
};
