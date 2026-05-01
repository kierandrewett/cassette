"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";

// Top loading bar driven by App Router navigation.
//
// Strategy: NProgress.start() is delayed 100 ms so instantaneous client-side
// transitions don't flash a stripe across the screen. When the pathname or
// search params change, we treat that as "the destination has rendered" and
// call NProgress.done() to animate the bar to 100% and fade it out.
//
// We also intercept `link click` and `popstate` events to call start() — the
// pathname doesn't change synchronously when Next.js begins streaming an RSC
// response, so without this hook the bar would only appear AFTER the route
// has finished. The 100 ms delay still applies, so cached/instant navigations
// stay flicker-free.

const START_DELAY_MS = 100;

const configureOnce = (() => {
    let configured = false;
    return () => {
        if (configured) return;
        configured = true;
        NProgress.configure({
            showSpinner: false,
            trickleSpeed: 180,
            minimum: 0.12,
            easing: "ease",
            speed: 320,
        });
    };
})();

export const TopLoader = () => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isStartedRef = useRef(false);

    // Configure NProgress once. Re-configuring is cheap but pointless.
    useEffect(() => {
        configureOnce();
    }, []);

    // Cancel any pending start and finish whichever instance is currently
    // running. Called whenever the URL settles.
    useEffect(() => {
        if (startTimerRef.current) {
            clearTimeout(startTimerRef.current);
            startTimerRef.current = null;
        }
        if (isStartedRef.current) {
            NProgress.done();
            isStartedRef.current = false;
        }
    }, [pathname, searchParams]);

    // Listen for navigation triggers — anchor clicks and popstate. These
    // happen BEFORE the new URL has propagated through React, so they're our
    // earliest reliable hook.
    useEffect(() => {
        const handleAnchorClick = (e: MouseEvent) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            const anchor = target.closest("a");
            if (!anchor) return;
            // Only intercept same-origin, primary-button, no-modifier clicks.
            if (anchor.target && anchor.target !== "_self") return;
            if (anchor.hasAttribute("download")) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            const href = anchor.getAttribute("href");
            if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
            try {
                const url = new URL(anchor.href, window.location.href);
                if (url.origin !== window.location.origin) return;
                if (url.pathname === window.location.pathname && url.search === window.location.search) {
                    return;
                }
            } catch {
                return;
            }
            schedule();
        };

        const handlePopState = () => schedule();

        const schedule = () => {
            if (startTimerRef.current) clearTimeout(startTimerRef.current);
            startTimerRef.current = setTimeout(() => {
                NProgress.start();
                isStartedRef.current = true;
                startTimerRef.current = null;
            }, START_DELAY_MS);
        };

        document.addEventListener("click", handleAnchorClick, { capture: true });
        window.addEventListener("popstate", handlePopState);
        return () => {
            document.removeEventListener("click", handleAnchorClick, { capture: true });
            window.removeEventListener("popstate", handlePopState);
            if (startTimerRef.current) clearTimeout(startTimerRef.current);
        };
    }, []);

    return null;
};
