"use client";

import { useMediaState } from "@vidstack/react";

import type { VideoChapter } from "@/server/db/schema/videos";

interface ChapterTrackProps {
    chapters: VideoChapter[];
}

/**
 * A 4-px tall segmented progress bar subdivided by chapter boundaries.
 * Segments are separated by 2-px gaps. Colours:
 *   played:   rgba(255,255,255,0.95)
 *   buffered: rgba(255,255,255,0.45)
 *   unplayed: rgba(255,255,255,0.25)
 */
export const ChapterTrack = ({ chapters }: ChapterTrackProps) => {
    const currentTime = useMediaState("currentTime");
    const bufferedEnd = useMediaState("bufferedEnd");
    const duration = useMediaState("duration");

    if (!duration || duration <= 0) return null;

    // If no chapters, render a single contiguous bar.
    const segments =
        chapters.length > 0
            ? chapters.map((ch, i) => ({
                  start: ch.startSec,
                  end: ch.endSec ?? chapters[i + 1]?.startSec ?? duration,
              }))
            : [{ start: 0, end: duration }];

    return (
        <div className="relative flex h-1 w-full items-center gap-px" aria-hidden="true">
            {segments.map((seg, i) => {
                const segDuration = seg.end - seg.start;
                const widthPct = (segDuration / duration) * 100;

                // Clamped played / buffered fractions within this segment.
                const playedRatio = Math.min(1, Math.max(0, (currentTime - seg.start) / segDuration));
                const bufferedRatio = Math.min(1, Math.max(0, (bufferedEnd - seg.start) / segDuration));

                return (
                    <div
                        key={i}
                        className="relative h-full overflow-hidden rounded-full"
                        style={{
                            width: `${widthPct}%`,
                            minWidth: "2px",
                            background: "rgba(255,255,255,0.25)",
                        }}
                    >
                        {/* Buffered layer */}
                        <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                                width: `${bufferedRatio * 100}%`,
                                background: "rgba(255,255,255,0.45)",
                            }}
                        />
                        {/* Played layer */}
                        <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                                width: `${playedRatio * 100}%`,
                                background: "rgba(255,255,255,0.95)",
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
};
