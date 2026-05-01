"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Persisted mode for the Up Next sidebar:
//   - "inline":   default — sidebar lives in-grid next to the player
//   - "hidden":   sidebar collapsed; main column expands to full width
//   - "floating": sidebar overlays the right edge of the viewport so the
//                 main column stays at its expanded width and the user can
//                 still scrub through Up Next without losing player real
//                 estate. This is the "floating" the user asked for.
type SidebarMode = "inline" | "hidden" | "floating";

const STORAGE_KEY = "watch:sidebarMode";

const isMode = (v: unknown): v is SidebarMode => v === "inline" || v === "hidden" || v === "floating";

type WatchLayoutProps = {
    main: ReactNode;
    sidebar: ReactNode;
};

// Sidebar icon — filled rectangle with a thin right-edge bar so the toggle
// is read as "right panel" without needing an icon-pack dependency. Stroke
// matches the surrounding text colour via currentColor.
const SidebarIcon = ({ open }: { open: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
    >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="15" y1="4" x2="15" y2="20" />
        {/* The chevron flips with the open state so the affordance reads
            as "collapse →" when open and "expand ←" when closed. */}
        {open ? <path d="M19 10l-2 2 2 2" /> : <path d="M17 10l2 2 -2 2" />}
    </svg>
);

export const WatchLayout = ({ main, sidebar }: WatchLayoutProps) => {
    // Default to inline so the first paint matches what server-rendered HTML
    // would show; localStorage hydration happens after mount.
    const [mode, setMode] = useState<SidebarMode>("inline");
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (isMode(stored)) setMode(stored);
        } catch {
            // localStorage may be unavailable (SSR / private mode); ignore.
        }
        setHydrated(true);
    }, []);

    const setAndPersist = (m: SidebarMode) => {
        setMode(m);
        try {
            localStorage.setItem(STORAGE_KEY, m);
        } catch {
            // best-effort persist
        }
    };

    // Toggle cycle:
    //   inline   → hidden   (user wants more room)
    //   hidden   → floating (user wants Up Next back, but as overlay)
    //   floating → hidden   (dismiss the overlay)
    // After the first toggle the sidebar never reverts to "inline" by the
    // toggle alone — that mode is only the day-one default. A future
    // settings toggle could expose it explicitly if needed.
    const onToggle = () => {
        if (mode === "inline") setAndPersist("hidden");
        else if (mode === "hidden") setAndPersist("floating");
        else setAndPersist("hidden");
    };

    const visible = mode !== "hidden";
    const floating = mode === "floating";

    return (
        <div className="watch-shell relative mx-auto w-full max-w-[1600px] px-4 py-4 md:px-6 lg:px-8">
            {/* Viewport-fixed toggle. Placed clear of the player chrome so it
                never competes with play/pause overlays or the captions menu.
                Hidden until hydration so the icon doesn't flash with the
                wrong open/closed state during SSR. Hidden on small screens
                because the sidebar already stacks below the player on
                mobile (no horizontal real estate to recover). */}
            {hydrated && (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={visible ? "Hide Up Next sidebar" : "Show Up Next sidebar"}
                    aria-pressed={visible}
                    title={visible ? "Hide sidebar" : "Show sidebar"}
                    className={cn(
                        "fixed right-4 top-20 z-40 hidden h-9 w-9 items-center justify-center rounded-full lg:inline-flex",
                        "bg-background/70 text-foreground/80 shadow-md ring-1 ring-border/60 backdrop-blur-md",
                        "transition-colors hover:bg-background hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                >
                    <SidebarIcon open={visible} />
                </button>
            )}

            <div className="watch-grid flex flex-col gap-6 lg:flex-row lg:gap-8">
                <div className="watch-main min-w-0 flex-1">{main}</div>

                {/* Inline sidebar — only present in "inline" mode so the grid
                    actually reflows when the sidebar is hidden or floating
                    (using `display: none` would leave the grid track in
                    place and the player wouldn't widen). */}
                {visible && !floating && (
                    <aside
                        className="watch-aside w-full lg:w-[var(--watch-sidebar-w,360px)] lg:flex-shrink-0"
                        aria-label="Up Next"
                    >
                        {sidebar}
                    </aside>
                )}
            </div>

            {/* Floating sidebar — fixed to the viewport so it stays put while
                the page scrolls. Glass surface so the moving content behind
                it reads through; max-h + scroll keeps the panel contained
                on short viewports. */}
            {visible && floating && (
                <aside
                    aria-label="Up Next"
                    className={cn(
                        "fixed right-3 top-20 z-30 w-[360px] max-w-[calc(100vw-1.5rem)]",
                        "max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl p-3 shadow-2xl",
                        "surface-glass animate-in fade-in-0 slide-in-from-right-4",
                    )}
                >
                    {sidebar}
                </aside>
            )}
        </div>
    );
};
