"use client";

import { useMediaRemote, useMediaState } from "@vidstack/react";
import { useEffect, useRef } from "react";

// Single-click vs double-click resolution window. 250 ms matches the
// platform double-click default and is the spec-mandated debounce so a
// single click doesn't toggle play/pause when the user is mid-double-click
// (which would otherwise leave the player in the wrong state before
// fullscreen kicks in).
const CLICK_RESOLVE_MS = 250;

/**
 * Wires bare click + double-click gestures over the player canvas:
 *   - single click  -> toggle play/pause
 *   - double click  -> toggle fullscreen
 *
 * Hand-rolled instead of Vidstack's <Gesture> because Vidstack fires the
 * single-click action immediately on `pointerup` even when a `dblpointerup`
 * follows, which produces a flicker (pause-then-fullscreen) on every
 * double-click. A timer-based resolver gives us the YouTube-style behaviour
 * the user actually expects.
 *
 * Listener is attached to the parent `.player-canvas` element via DOM
 * traversal because the gesture island sits *inside* that canvas, and we
 * want clicks anywhere on the canvas (not just over this empty island) to
 * register.
 */
export const PlayerGestures = () => {
    const remote = useMediaRemote();
    const fullscreen = useMediaState("fullscreen");
    const ref = useRef<HTMLDivElement>(null);
    // Stash the latest fullscreen state in a ref so the click handler always
    // reads the current value without resubscribing.
    const fullscreenRef = useRef(fullscreen);
    fullscreenRef.current = fullscreen;

    useEffect(() => {
        const el = ref.current?.parentElement;
        if (!el) return;

        let pending: ReturnType<typeof setTimeout> | null = null;

        // Ignore clicks on chrome elements — buttons, menus, sliders. Without
        // this, every chrome interaction (e.g. clicking the play button in
        // the bottom bar) would also trigger the canvas play/pause toggle and
        // immediately revert the action.
        const isChromeTarget = (target: EventTarget | null): boolean => {
            if (!(target instanceof Element)) return false;
            return Boolean(
                target.closest(
                    [
                        "button",
                        "a",
                        "[role='menu']",
                        "[role='menuitem']",
                        "[role='dialog']",
                        "[role='slider']",
                        ".player-bar",
                        ".player-popover",
                        // Ignore Vidstack's own internal slider primitives
                        // even when not wrapped in a player-bar (e.g. the
                        // time-slider preview tooltip surface).
                        "[data-media-slider]",
                    ].join(", "),
                ),
            );
        };

        const onClick = (e: MouseEvent) => {
            if (isChromeTarget(e.target)) return;
            if (pending) return; // wait for the dblclick window to elapse
            pending = setTimeout(() => {
                pending = null;
                remote.togglePaused();
            }, CLICK_RESOLVE_MS);
        };

        const onDblClick = (e: MouseEvent) => {
            if (isChromeTarget(e.target)) return;
            // Cancel the pending single-click so we don't toggle pause and
            // then immediately fullscreen.
            if (pending) {
                clearTimeout(pending);
                pending = null;
            }
            if (fullscreenRef.current) {
                void remote.exitFullscreen();
            } else {
                void remote.enterFullscreen();
            }
        };

        el.addEventListener("click", onClick);
        el.addEventListener("dblclick", onDblClick);
        return () => {
            if (pending) clearTimeout(pending);
            el.removeEventListener("click", onClick);
            el.removeEventListener("dblclick", onDblClick);
        };
    }, [remote]);

    // Empty marker — used only to find the canvas via parentElement.
    return <div ref={ref} className="hidden" aria-hidden="true" />;
};
