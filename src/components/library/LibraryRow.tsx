"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface LibraryRowProps {
    heading: string;
    /** Optional "see all" destination shown on the right side of the header. */
    seeAllHref?: string;
    /** Optional caption rendered under the heading (e.g. count, hint). */
    caption?: string;
    children: React.ReactNode;
    className?: string;
}

// Apple-TV-style "shelf" wrapper: heading + "see all" link, then a horizontally
// scrollable row of cards. Adds chevron buttons that page through the row by
// ~80% of its width so users without a horizontal scrollbar (trackpads can
// usually two-finger scroll, but mice on desktop often can't) have a way to
// navigate. Buttons hide when the row can't scroll further in their direction
// and on touch devices where native swipe is the expected interaction.
export const LibraryRow = ({ heading, seeAllHref, caption, children, className }: LibraryRowProps) => {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const [canLeft, setCanLeft] = useState(false);
    const [canRight, setCanRight] = useState(false);

    const updateButtons = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        setCanLeft(el.scrollLeft > 4);
        setCanRight(el.scrollLeft < max - 4);
    }, []);

    useEffect(() => {
        updateButtons();
        const el = scrollerRef.current;
        if (!el) return;
        el.addEventListener("scroll", updateButtons, { passive: true });
        const ro = new ResizeObserver(() => updateButtons());
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", updateButtons);
            ro.disconnect();
        };
    }, [updateButtons]);

    const page = (direction: 1 | -1) => {
        const el = scrollerRef.current;
        if (!el) return;
        const reduced =
            typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
    };

    // Arrow-key navigation across cards in the shelf — TV remote / D-pad
    // friendly. We collect every focusable card link, find the active one,
    // then focus + smooth-scroll the prev/next sibling into view. ArrowUp /
    // ArrowDown intentionally fall through to the browser default so the
    // user can move between shelves vertically.
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const scroller = scrollerRef.current;
        if (!scroller) return;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !scroller.contains(active)) return;
        const items = Array.from(
            scroller.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"),
        );
        if (items.length === 0) return;
        // Resolve the focused card itself even if focus is on a nested element.
        const current = items.find((el) => el === active || el.contains(active));
        const idx = current ? items.indexOf(current) : -1;
        if (idx === -1) return;
        const nextIdx = e.key === "ArrowRight" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
        if (nextIdx === idx) return;
        e.preventDefault();
        const target = items[nextIdx]!;
        target.focus({ preventScroll: true });
        const reduced =
            typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "center" });
    };

    return (
        <section className={cn("group/row space-y-3", className)}>
            <div className="flex items-end justify-between gap-3 px-4 md:px-6">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
                    {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
                </div>
                {seeAllHref && (
                    <Link
                        href={seeAllHref}
                        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        See all
                    </Link>
                )}
            </div>
            <div className="relative">
                {/* Scroll container — py-3 leaves room for the VideoCard hover
                    halo (which extends 8px past the card via -inset-2);
                    without the vertical padding the halo got clipped at the
                    top edge of the overflow box. */}
                <div
                    ref={scrollerRef}
                    className="scrollbar-hide flex gap-3 overflow-x-auto scroll-smooth px-4 py-3 md:px-6"
                    style={{ scrollbarWidth: "none" }}
                    onKeyDown={onKeyDown}
                >
                    {children}
                </div>

                {/* Left / right pager buttons — desktop-only so touch users
                    keep the native swipe flow. Each fades in only when its
                    direction has somewhere to go. */}
                <button
                    type="button"
                    onClick={() => page(-1)}
                    aria-label="Scroll left"
                    className={cn(
                        "absolute left-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/95 text-foreground shadow-md ring-1 ring-border md:flex",
                        "transition-opacity duration-150 ease-out",
                        "hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        canLeft ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    <ChevronLeft className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                    type="button"
                    onClick={() => page(1)}
                    aria-label="Scroll right"
                    className={cn(
                        "absolute right-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/95 text-foreground shadow-md ring-1 ring-border md:flex",
                        "transition-opacity duration-150 ease-out",
                        "hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        canRight ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    <ChevronRight className="h-5 w-5" strokeWidth={2} />
                </button>
            </div>
        </section>
    );
};
