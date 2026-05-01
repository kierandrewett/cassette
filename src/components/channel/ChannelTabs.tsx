import Link from "next/link";

import { cn } from "@/lib/utils";

interface ChannelTab {
    label: string;
    href: string;
    active: boolean;
}

interface ChannelTabsProps {
    tabs: ChannelTab[];
}

// Horizontal tab navigation for the channel page.
// Uses plain anchor links so it works as a server component without the
// Radix Tabs state management, allowing each tab content to be a separate
// server-rendered route segment or searchParam section.
export const ChannelTabs = ({ tabs }: ChannelTabsProps) => {
    return (
        <div
            className="border-b border-border"
            role="tablist"
            aria-label="Channel sections"
        >
            <div className="mx-auto max-w-5xl px-4 md:px-6">
                <nav className="-mb-px flex gap-6">
                    {tabs.map((tab) => (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            role="tab"
                            aria-selected={tab.active}
                            className={cn(
                                "inline-flex items-center border-b-2 pb-3 pt-3 text-sm font-medium transition-colors",
                                tab.active
                                    ? "border-foreground text-foreground"
                                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                        >
                            {tab.label}
                        </Link>
                    ))}
                </nav>
            </div>
        </div>
    );
};
