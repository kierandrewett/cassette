"use client";

import { useMediaRemote, useMediaState } from "@vidstack/react";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const CENTRE_IDLE_MS = 2500;

/**
 * Big central play/pause button.
 *
 * Visible when paused, or when the user hovers the player (active=true and
 * not fullscreen-idle). Uses an Apple-TV-style pulse animation on hover.
 * The buffer spinner is shown when media is waiting / stalled.
 *
 * The button fades out after ~2.5s of pointer/keyboard inactivity even
 * when the video is paused — the global idle hook keeps the chrome bars
 * permanently visible while paused, but the giant centre puck looked
 * stuck on a still frame. Reappears on any movement.
 */
export const PlayerCenterStage = () => {
    const remote = useMediaRemote();
    const paused = useMediaState("paused");
    const waiting = useMediaState("waiting");
    const playing = useMediaState("playing");

    // Local idle tracker — independent of useIdleControls because that one
    // pins active=true while paused.
    const [active, setActive] = useState(true);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const wake = () => {
            setActive(true);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            idleTimerRef.current = setTimeout(() => setActive(false), CENTRE_IDLE_MS);
        };
        wake();
        document.addEventListener("mousemove", wake);
        document.addEventListener("keydown", wake);
        return () => {
            document.removeEventListener("mousemove", wake);
            document.removeEventListener("keydown", wake);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, []);

    // Show when (paused OR neither playing nor waiting) AND user is active.
    const showButton = (paused || (!playing && !waiting)) && active;
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
                    className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white"
                />
            )}

            {/* Big play/pause */}
            {!showSpinner && (
                <button
                    aria-label={paused ? "Play" : "Pause"}
                    onClick={handleClick}
                    className={cn(
                        "pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full",
                        "border border-white/10 bg-black/40 backdrop-blur-sm",
                        "transition-all duration-200",
                        "hover:scale-110 hover:border-white/20 hover:bg-black/60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                        // Apple-TV pulse keyframe from globals.css via Tailwind
                        "active:scale-95",
                        showButton ? "opacity-100" : "opacity-0",
                    )}
                >
                    {paused ? (
                        <Play size={28} color="#fff" fill="#fff" strokeWidth={0} className="ml-1" />
                    ) : (
                        <Pause size={28} color="#fff" fill="#fff" strokeWidth={0} />
                    )}
                </button>
            )}
        </div>
    );
};
