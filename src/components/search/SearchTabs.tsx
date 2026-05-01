"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
    { value: "videos", label: "Videos" },
    { value: "channels", label: "Channels" },
    { value: "playlists", label: "Playlists" },
] as const;

export type SearchTabValue = (typeof TABS)[number]["value"];

// Renders the tab strip beneath the filter chips on /search. The active tab
// is driven by `?tab=...` on the URL; clicking a tab is a same-page navigation
// preserving every other query param so the user's typed query and filters
// survive a tab switch.
export const SearchTabs = ({ active }: { active: SearchTabValue }) => {
    const params = useSearchParams();

    const hrefFor = (tab: SearchTabValue): string => {
        const next = new URLSearchParams(params.toString());
        if (tab === "videos") {
            next.delete("tab");
        } else {
            next.set("tab", tab);
        }
        const qs = next.toString();
        return qs ? `/search?${qs}` : "/search";
    };

    return (
        <nav className="flex items-center gap-2 border-b border-border" aria-label="Search categories">
            {TABS.map((t) => {
                const isActive = t.value === active;
                return (
                    <Link
                        key={t.value}
                        href={hrefFor(t.value)}
                        className={cn(
                            "relative px-3 py-2 text-sm font-medium transition-colors",
                            isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                        aria-current={isActive ? "page" : undefined}
                    >
                        {t.label}
                        {isActive ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" /> : null}
                    </Link>
                );
            })}
        </nav>
    );
};
