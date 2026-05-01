"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_MS = 3000;

/**
 * Returns `{ active }` — true when the user has recently moved the mouse,
 * pressed a key, or focused an element within the player. Resets to false
 * after IDLE_MS of inactivity.
 *
 * Always active when paused (so controls remain visible).
 */
export const useIdleControls = (paused: boolean): { active: boolean } => {
    const [active, setActive] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const wake = useCallback(() => {
        setActive(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setActive(false);
        }, IDLE_MS);
    }, []);

    // Keep active when paused.
    useEffect(() => {
        if (paused) {
            setActive(true);
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        } else {
            // Restart idle timer when playback resumes.
            wake();
        }
    }, [paused, wake]);

    useEffect(() => {
        const onMove = () => wake();
        const onKey = () => wake();
        const onFocus = () => wake();

        document.addEventListener("mousemove", onMove);
        document.addEventListener("keydown", onKey);
        document.addEventListener("focusin", onFocus);

        return () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("focusin", onFocus);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [wake]);

    return { active };
};
