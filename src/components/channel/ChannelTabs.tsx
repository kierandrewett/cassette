"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface ChannelTabsProps {
    handle: string;
}

interface ChannelTabSpec {
    label: string;
    /** URL slug after /channel/<handle>/. Empty string is the videos root. */
    slug: "" | "playlists" | "about";
}

const TABS: ChannelTabSpec[] = [
    { label: "Videos", slug: "" },
    { label: "Playlists", slug: "playlists" },
    { label: "About", slug: "about" },
];

// Horizontal tab navigation for the channel page.
//
// Tabs are routes now: /channel/<handle>, /channel/<handle>/playlists,
// /channel/<handle>/about. Active state is derived from the live pathname
// rather than from a server-rendered query string, which lets the layout
// stay shared and avoids re-rendering the header on tab switches.
export const ChannelTabs = ({ handle }: ChannelTabsProps) => {
    const pathname = usePathname();
    const base = `/channel/${handle}`;

    return (
        <div className="border-b border-border" role="tablist" aria-label="Channel sections">
            <div className="mx-auto max-w-5xl px-4 md:px-6">
                <nav className="-mb-px flex gap-6">
                    {TABS.map((tab) => {
                        const href = tab.slug ? `${base}/${tab.slug}` : base;
                        // The videos tab matches both the bare base and the
                        // explicit /videos route (which redirects up).
                        const active = tab.slug
                            ? pathname === href || pathname.startsWith(`${href}/`)
                            : pathname === base || pathname === `${base}/videos`;

                        return (
                            <Link
                                key={tab.label}
                                href={href}
                                role="tab"
                                aria-selected={active}
                                className={cn(
                                    "inline-flex items-center border-b-2 pb-3 pt-3 text-sm font-medium transition-colors",
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
