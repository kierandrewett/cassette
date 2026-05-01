import type { Metadata } from "next";
import Link from "next/link";

import AppShell from "@/components/shell/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/server";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/utils";

export const metadata: Metadata = {
    title: "Explore channels",
};

interface PageProps {
    searchParams: Promise<{ tab?: string; cursor?: string }>;
}

const PAGE_SIZE = 24;

const isSort = (s: string | undefined): s is "subscribers" | "recent" => s === "subscribers" || s === "recent";

const ExploreChannelsPage = async ({ searchParams }: PageProps) => {
    const { tab, cursor } = await searchParams;
    const sort = isSort(tab) ? tab : "subscribers";
    const cursorNum = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;

    const result = await trpc.channel.listPublic({ sort, cursor: cursorNum, limit: PAGE_SIZE });

    const tabs: Array<{ value: "subscribers" | "recent"; label: string }> = [
        { value: "subscribers", label: "Most subscribers" },
        { value: "recent", label: "Recently active" },
    ];

    return (
        <AppShell>
            <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
                <header className="mb-8 flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">Explore channels</h1>
                    <p className="text-sm text-muted-foreground">Browse every public channel on the platform.</p>
                </header>

                {/* Sort tabs */}
                <nav className="mb-6 flex gap-1 border-b border-border">
                    {tabs.map((t) => (
                        <Link
                            key={t.value}
                            href={`/explore/channels?tab=${t.value}`}
                            className={cn(
                                "px-4 py-2.5 text-sm font-medium transition-colors",
                                sort === t.value
                                    ? "border-b-2 border-foreground text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t.label}
                        </Link>
                    ))}
                </nav>

                {result.items.length === 0 ? (
                    <p className="py-20 text-center text-sm text-muted-foreground">No channels yet.</p>
                ) : (
                    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {result.items.map((c) => (
                            <li key={c.id}>
                                <Link
                                    href={`/c/${c.handle}`}
                                    className="flex h-full flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center transition-colors hover:border-primary/40"
                                >
                                    <Avatar className="h-20 w-20">
                                        {c.avatarPath && <AvatarImage src={`/api/hls/${c.avatarPath}`} alt={c.name} />}
                                        <AvatarFallback className="text-xl uppercase">
                                            {c.name.slice(0, 2)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-1">
                                        <p className="text-base font-semibold text-foreground">{c.name}</p>
                                        <p className="text-xs text-muted-foreground">@{c.handle}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {formatCount(c.subscriberCount)}{" "}
                                        {c.subscriberCount === 1 ? "subscriber" : "subscribers"}
                                        {" · "}
                                        {formatCount(c.videoCount)} {c.videoCount === 1 ? "video" : "videos"}
                                    </p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {/* Pagination */}
                <div className="mt-8 flex items-center justify-between text-sm">
                    {cursorNum > 0 ? (
                        <Link
                            href={`/explore/channels?tab=${sort}&cursor=${Math.max(0, cursorNum - PAGE_SIZE)}`}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            &larr; Previous
                        </Link>
                    ) : (
                        <span />
                    )}
                    {result.nextCursor !== null ? (
                        <Link
                            href={`/explore/channels?tab=${sort}&cursor=${result.nextCursor}`}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            Next &rarr;
                        </Link>
                    ) : (
                        <span />
                    )}
                </div>
            </div>
        </AppShell>
    );
};

export default ExploreChannelsPage;
