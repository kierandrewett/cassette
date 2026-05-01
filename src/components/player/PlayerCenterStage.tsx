"use client";

import { useMediaRemote, useMediaState } from "@vidstack/react";
import { PauseIcon, PlayIcon } from "hugeicons-react";

import { cn } from "@/lib/utils";

/**
 * Big central play/pause button.
 *
 * Visible when paused, or when the user hovers the player (active=true and
 * not fullscreen-idle). Uses an Apple-TV-style pulse animation on hover.
 * The buffer spinner is shown when media is waiting / stalled.
 */
export const PlayerCenterStage = () => {
    const remote = useMediaRemote();
    const paused = useMediaState("paused");
    const waiting = useMediaState("waiting");
    const playing = useMediaState("playing");

    const showButton = paused || (!playing && !waiting);
    const showSpinner = waiting && !paused;

    const handleClick = () => {
        if (paused) {
            void remote.play();
        } else {
            void remote.pause();
        }
    };

    return (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            {/* Buffer spinner */}
            {showSpinner && (
                <div
                    aria-label="Loading"
                    className="h-12 w-12 rounded-full border-2 border-white/20 border-t-white animate-spin"
                />
            )}

            {/* Big play/pause */}
            {!showSpinner && (
                <button
                    aria-label={paused ? "Play" : "Pause"}
                    onClick={handleClick}
                    className={cn(
                        "pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full",
                        "bg-black/40 backdrop-blur-sm border border-white/10",
                        "transition-all duration-200",
                        "hover:scale-110 hover:bg-black/60 hover:border-white/20",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                        // Apple-TV pulse keyframe from globals.css via Tailwind
                        "active:scale-95",
                        showButton ? "opacity-100" : "opacity-0",
                    )}
                >
                    {paused ? (
                        <PlayIcon size={28} color="#fff" className="ml-1" />
                    ) : (
                        <PauseIcon size={28} color="#fff" />
                    )}
                </button>
            )}
        </div>
    );
};
