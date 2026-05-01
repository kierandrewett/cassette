"use client";

import { X } from "lucide-react";
import Image from "next/image";

import { usePlayerStore } from "@/lib/player/store";

interface PlayerTopBarProps {
    title: string;
    channelName: string;
    channelHandle: string;
    avatarPath: string | null;
    active: boolean;
}

/**
 * Top glass-blur bar — shows title + channel info (only in theatre/fullscreen).
 * Fades in/out with the .player-bar class driven by the active data attribute.
 */
export const PlayerTopBar = ({
    title,
    channelName,
    channelHandle,
    avatarPath,
    active,
}: PlayerTopBarProps) => {
    const theatre = usePlayerStore((s) => s.theatre);
    const setTheatre = usePlayerStore((s) => s.setTheatre);

    // The top bar is only visible in theatre or fullscreen mode.
    if (!theatre) return null;

    return (
        <div
            className="player-bar absolute inset-x-0 top-0 z-30 flex items-center gap-3 px-4 pt-4 pb-8"
            data-active={active ? "true" : "false"}
            data-position="top"
        >
            {/* Channel avatar */}
            {avatarPath ? (
                <Image
                    src={`/api/hls/${channelHandle}/avatar`}
                    alt={channelName}
                    width={32}
                    height={32}
                    unoptimized
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20 flex-shrink-0"
                />
            ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white/80 ring-1 ring-white/20">
                    {channelName[0]?.toUpperCase() ?? "C"}
                </div>
            )}

            {/* Title + channel */}
            <div className="flex min-w-0 flex-col">
                <p className="truncate text-sm font-semibold text-white leading-snug">{title}</p>
                <p className="truncate text-xs text-white/60 leading-snug">
                    {channelName}
                    <span className="mx-1 text-white/30">&middot;</span>
                    @{channelHandle}
                </p>
            </div>

            {/* Exit theatre button */}
            <button
                aria-label="Exit theatre mode"
                onClick={() => setTheatre(false)}
                className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};
