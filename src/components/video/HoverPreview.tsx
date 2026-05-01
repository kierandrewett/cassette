"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { readPreferences } from "@/lib/player/preferences";

interface HoverPreviewProps {
    videoId: string;
    durationSec: number | null;
    /** ref to the element that triggers pointer-enter/leave */
    triggerRef: RefObject<HTMLElement | null>;
    /** Set to false to opt out of the preview entirely. Default true. */
    enabled?: boolean;
}

// Total frames in the 10×10 sprite grid.
const GRID = 10;
const TOTAL_FRAMES = GRID * GRID;
// How long to dwell on each frame (ms).
const TICK_MS = 50;
// Delay before preview starts (ms).
const DELAY_MS = 600;

/** Returns the CSS background-position for a given frame index (0-99). */
function bgPosition(frame: number): string {
    const col = frame % GRID;
    const row = Math.floor(frame / GRID);
    // Each step = 100/9 ≈ 11.111...% so that col 9 / row 9 maps to 100%.
    const x = col === 0 ? 0 : (col / (GRID - 1)) * 100;
    const y = row === 0 ? 0 : (row / (GRID - 1)) * 100;
    return `${x.toFixed(4)}% ${y.toFixed(4)}%`;
}

/**
 * Gate component: checks all opt-out conditions before mounting the inner
 * implementation, so the inner component can use hooks unconditionally.
 */
export const HoverPreview = ({
    videoId,
    durationSec,
    triggerRef,
    enabled = true,
}: HoverPreviewProps) => {
    // Feature-gate checks. Evaluated client-side only via typeof guards.
    // These are stable for the component lifetime (change only on full reload).
    const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // navigator.connection is non-standard; cast via unknown.
    const saveData =
        typeof navigator !== "undefined" &&
        (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData === true;

    const userPrefEnabled = readPreferences().hoverPreviewsEnabled;

    if (!enabled || !userPrefEnabled || prefersReducedMotion || saveData) {
        return null;
    }

    return (
        <HoverPreviewInner
            videoId={videoId}
            durationSec={durationSec}
            triggerRef={triggerRef}
        />
    );
};

// ---------------------------------------------------------------------------
// Inner implementation — only mounted when all gate conditions pass.
// ---------------------------------------------------------------------------

interface InnerProps {
    videoId: string;
    durationSec: number | null;
    triggerRef: RefObject<HTMLElement | null>;
}

const HoverPreviewInner = ({ videoId, triggerRef }: InnerProps) => {
    const [frame, setFrame] = useState(1);
    const [visible, setVisible] = useState(false);
    const [preloaded, setPreloaded] = useState(false);

    const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const spriteUrl = `/api/hls/${videoId}/thumb/sprite.jpg`;

    useEffect(() => {
        const el = triggerRef.current;
        if (!el) return;

        const onEnter = () => {
            // Lazy-preload the sprite on first hover.
            if (!preloaded) {
                const img = new Image();
                img.src = spriteUrl;
                setPreloaded(true);
            }

            delayTimer.current = setTimeout(() => {
                setFrame(1);
                setVisible(true);
                intervalRef.current = setInterval(() => {
                    setFrame((f) => {
                        const next = f + 1;
                        // Skip frame 0 (static thumbnail); wrap 99 → 1.
                        return next >= TOTAL_FRAMES ? 1 : next;
                    });
                }, TICK_MS);
            }, DELAY_MS);
        };

        const onLeave = () => {
            if (delayTimer.current !== null) {
                clearTimeout(delayTimer.current);
                delayTimer.current = null;
            }
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            setVisible(false);
            setFrame(1);
        };

        el.addEventListener("pointerenter", onEnter);
        el.addEventListener("pointerleave", onLeave);

        return () => {
            el.removeEventListener("pointerenter", onEnter);
            el.removeEventListener("pointerleave", onLeave);
            if (delayTimer.current !== null) clearTimeout(delayTimer.current);
            if (intervalRef.current !== null) clearInterval(intervalRef.current);
        };
    }, [triggerRef, spriteUrl, preloaded]);

    return (
        <div
            aria-hidden="true"
            className="absolute inset-0 z-10 rounded-xl"
            style={{
                backgroundImage: `url('${spriteUrl}')`,
                backgroundSize: `${GRID * 100}% ${GRID * 100}%`,
                backgroundPosition: bgPosition(frame),
                backgroundRepeat: "no-repeat",
                opacity: visible ? 1 : 0,
                transition: "opacity 200ms ease",
                pointerEvents: "none",
            }}
        />
    );
};
