"use client";

import { useMediaState } from "@vidstack/react";
import { useEffect, useRef } from "react";

import { usePlayerStore } from "@/lib/player/store";
import { useIdleControls } from "./useIdleControls";

interface PlayerCanvasProps {
    children: React.ReactNode;
}

/**
 * Wraps the player's inner canvas with data attributes that drive CSS:
 * - data-active="true|false"   — used by .player-bar to fade controls
 * - data-fullscreen="true|false" — hides cursor when idle in fullscreen
 * - data-theater="true|false"  — consumed by the watch page layout
 *
 * Doubles as the idle-controls boundary.
 */
export const PlayerCanvas = ({ children }: PlayerCanvasProps) => {
    const paused = useMediaState("paused");
    const fullscreen = useMediaState("fullscreen");
    const theatre = usePlayerStore((s) => s.theatre);
    const { active } = useIdleControls(paused);
    const ref = useRef<HTMLDivElement>(null);

    // Sync data-theater on the watch page root so the layout CSS can react.
    useEffect(() => {
        const root = document.getElementById("watch-page");
        if (root) {
            root.dataset["theater"] = theatre ? "true" : "false";
        }
    }, [theatre]);

    return (
        <div
            ref={ref}
            className="player-canvas absolute inset-0 z-20"
            data-active={active ? "true" : "false"}
            data-fullscreen={fullscreen ? "true" : "false"}
            data-theater={theatre ? "true" : "false"}
        >
            {children}
        </div>
    );
};
