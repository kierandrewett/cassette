"use client";

import { useState } from "react";
import { dispatchSeek } from "@/lib/player/store";
import { linkifyTimestamps } from "@/lib/timestamps";
import { cn } from "@/lib/utils";

interface DescriptionClientProps {
    text: string;
}

// URL pattern for auto-linking external URLs in descriptions.
const URL_RE = /https?:\/\/[^\s<>"]+/g;

type Segment =
    | { type: "text"; content: string }
    | { type: "url"; content: string };

/**
 * Split the text into plain-text and URL segments only. Timestamp linkification
 * is then delegated to `linkifyTimestamps` from `@/lib/timestamps` per line/segment.
 */
const parseUrlSegments = (text: string): Segment[] => {
    const segments: Segment[] = [];
    let pos = 0;

    URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(text)) !== null) {
        if (m.index > pos) {
            segments.push({ type: "text", content: text.slice(pos, m.index) });
        }
        segments.push({ type: "url", content: m[0] });
        pos = m.index + m[0].length;
    }

    if (pos < text.length) {
        segments.push({ type: "text", content: text.slice(pos) });
    }

    return segments;
};

/**
 * Client-side description renderer. Timestamps are rendered as buttons that
 * dispatch a seek event to the player (via the shared `linkifyTimestamps`
 * helper). URLs are rendered as external links. Long descriptions are clamped
 * with a "Show more" toggle.
 */
export const DescriptionClient = ({ text }: DescriptionClientProps) => {
    const [expanded, setExpanded] = useState(false);
    const segments = parseUrlSegments(text);

    const lineCount = text.split("\n").length;
    const needsClamp = lineCount > 5 || text.length > 280;

    const renderSegment = (seg: Segment, i: number) => {
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

        // Plain text: linkify timestamps then preserve newlines.
        const withTimestamps = linkifyTimestamps(seg.content, dispatchSeek);
        return withTimestamps.map((node, j) => {
            if (typeof node === "string") {
                return node.split("\n").map((line, k, arr) => (
                    <span key={`${i}-${j}-${k}`}>
                        {line}
                        {k < arr.length - 1 && <br />}
                    </span>
                ));
            }
            return <span key={`${i}-${j}`}>{node}</span>;
        });
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
