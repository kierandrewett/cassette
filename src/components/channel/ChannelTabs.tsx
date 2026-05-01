"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface ChannelTabsProps {
    handle: string;
    /** Whether the channel owner has opted into the Home tab. */
    showHome?: boolean;
}

interface ChannelTabSpec {
    label: string;
    /** URL slug after /@<handle>/. Empty string is the default tab (Home
     *  when enabled, otherwise Videos). */
    slug: "" | "videos" | "playlists" | "about";
}

// Horizontal tab navigation for the channel page.
//
// URLs are the canonical /@<handle> form. Active state is derived from the
// live pathname so the layout component can stay shared across tabs without
// re-rendering.
export const ChannelTabs = ({ handle, showHome = false }: ChannelTabsProps) => {
    const pathname = usePathname();
    const base = `/@${handle}`;

    const tabs: ChannelTabSpec[] = showHome
        ? [
              { label: "Home", slug: "" },
              { label: "Videos", slug: "videos" },
              { label: "Playlists", slug: "playlists" },
              { label: "About", slug: "about" },
          ]
        : [
              { label: "Videos", slug: "" },
              { label: "Playlists", slug: "playlists" },
              { label: "About", slug: "about" },
          ];

    // ArrowLeft / ArrowRight cycle focus through the tabs (ARIA tablist
    // pattern). Activation still requires Enter — these are real <a> tags
    // pointing at separate URLs, so we don't auto-navigate on focus.
    const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const root = e.currentTarget;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !root.contains(active)) return;
        const items = Array.from(root.querySelectorAll<HTMLElement>("[role='tab']"));
        const idx = items.indexOf(active);
        if (idx === -1) return;
        const len = items.length;
        const nextIdx = e.key === "ArrowRight" ? (idx + 1) % len : (idx - 1 + len) % len;
        if (nextIdx === idx) return;
        e.preventDefault();
        items[nextIdx]!.focus();
    };

    return (
        <div className="mt-6 border-b border-border" role="tablist" aria-label="Channel sections">
            <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
                <nav className="-mb-px flex gap-8" onKeyDown={onKeyDown}>
                    {tabs.map((tab) => {
                        const href = tab.slug ? `${base}/${tab.slug}` : base;
                        // Active when the current path matches the tab base
                        // exactly OR is nested under it. The default tab also
                        // matches the bare /@<handle> path.
                        const active = tab.slug
                            ? pathname === href || pathname.startsWith(`${href}/`)
                            : pathname === base;

                        return (
                            <Link
                                key={tab.label}
                                href={href}
                                role="tab"
                                aria-selected={active}
                                className={cn(
                                    "inline-flex items-center rounded-sm border-b-2 pb-3 pt-3 text-base font-bold tracking-tight transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    active
                                        ? "border-foreground text-foreground"
                                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                                )}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
};
