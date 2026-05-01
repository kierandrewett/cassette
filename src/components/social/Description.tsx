"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Matches HH:MM:SS or MM:SS timestamps in a description.
const TIMESTAMP_RE = /\b((?:\d{1,2}:)?\d{1,2}:\d{2})\b/g;

interface DescriptionProps {
    text: string;
    /** Called when the viewer clicks a timestamp link. */
    onTimestampClick?: (seconds: number) => void;
    className?: string;
}

/** Parse a timestamp string like "1:23:45" or "3:05" to seconds. */
function parseTimestamp(ts: string): number {
    const parts = ts.split(":").map(Number);
    if (parts.length === 3) {
        return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    }
    return parts[0]! * 60 + parts[1]!;
}

/**
 * Renders a video description with timestamp auto-linking and a
 * Show more / Show less toggle when the description is long.
 */
export const Description = ({ text, onTimestampClick, className }: DescriptionProps) => {
    const [expanded, setExpanded] = useState(false);

    const COLLAPSE_LINES = 3;
    const isLong = text.split("\n").length > COLLAPSE_LINES || text.length > 300;

    const renderText = (raw: string) => {
        const segments: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        TIMESTAMP_RE.lastIndex = 0;

        while ((match = TIMESTAMP_RE.exec(raw)) !== null) {
            const [full] = match;
            const start = match.index;

            if (start > lastIndex) {
                segments.push(raw.slice(lastIndex, start));
            }

            const seconds = parseTimestamp(full!);
            segments.push(
                <button
                    key={`ts-${start}`}
                    type="button"
                    onClick={() => onTimestampClick?.(seconds)}
                    className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {full}
                </button>,
            );

            lastIndex = start + full!.length;
        }

        if (lastIndex < raw.length) {
            segments.push(raw.slice(lastIndex));
        }

        return segments;
    };

    const displayText = isLong && !expanded ? text.split("\n").slice(0, COLLAPSE_LINES).join("\n") + "…" : text;

    return (
        <div className={cn("text-sm leading-relaxed", className)}>
            <p className="whitespace-pre-wrap">{renderText(displayText)}</p>
            {isLong && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto px-0 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded((v) => !v)}
                >
                    {expanded ? "Show less" : "Show more"}
                </Button>
            )}
        </div>
    );
};
