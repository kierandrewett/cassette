import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";

import AppShell from "@/components/shell/AppShell";
import { SearchFilters } from "@/components/search/SearchFilters";
import { SearchResultCard, type SearchResultVideo } from "@/components/search/SearchResultCard";
import { SearchTabs, type SearchTabValue } from "@/components/search/SearchTabs";
import { SearchChannelCard, type SearchChannelResult } from "@/components/search/SearchChannelCard";
import { SearchPlaylistCard, type SearchPlaylistResult } from "@/components/search/SearchPlaylistCard";
import { parseSearchFilters } from "@/components/search/filterParams";
import { createTRPCContext } from "@/server/api/trpc";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { searchRouter } from "@/server/api/routers/search";

interface SearchPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Inline caller for the search sub-router. Independent of whether root.ts
// has `search: searchRouter` wired (it does after Phase C integration).
const createSearchCaller = createCallerFactory(createTRPCRouter({ search: searchRouter }));

export const generateMetadata = async ({ searchParams }: SearchPageProps): Promise<Metadata> => {
    const resolved = await searchParams;
    const q = typeof resolved.q === "string" ? resolved.q : "";
    return {
        title: q ? `"${q}" — Search` : "Search",
    };
};

const flattenParams = (params: Record<string, string | string[] | undefined>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
        if (typeof v === "string") out[k] = v;
        else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") out[k] = v[0];
    }
    return out;
};

const isTab = (s: string | undefined): s is SearchTabValue => s === "videos" || s === "channels" || s === "playlists";

const SearchPage = async ({ searchParams }: SearchPageProps) => {
    const resolved = await searchParams;
    const flat = flattenParams(resolved);
    const filters = parseSearchFilters(flat);
    const tab: SearchTabValue = isTab(flat["tab"]) ? flat["tab"] : "videos";

    const { q, uploadedWithin, duration, hasCaptions, tag } = filters;
    const trimmed = q.trim();
    // Allow tag-only searches with an empty query string.
    const hasQuery = trimmed.length > 0 || !!tag;

    const ctx = await createTRPCContext({ headers: await headers() });
    const caller = createSearchCaller(() => Promise.resolve(ctx));

    let videoItems: SearchResultVideo[] = [];
    let channelItems: SearchChannelResult[] = [];
    let playlistItems: SearchPlaylistResult[] = [];

    if (hasQuery) {
        if (tab === "videos") {
            const r = await caller.search.videos({
                q: trimmed,
                uploadedWithin,
                duration,
                hasCaptions,
                tag,
                limit: 20,
            });
            videoItems = r.items;
        } else if (tab === "channels") {
            if (trimmed.length > 0) {
                const r = await caller.search.channels({ q: trimmed, limit: 20 });
                channelItems = r.items;
            }
        } else {
            if (trimmed.length > 0) {
                const r = await caller.search.playlists({ q: trimmed, limit: 20 });
                playlistItems = r.items;
            }
        }
    }

    const empty =
        (tab === "videos" && videoItems.length === 0) ||
        (tab === "channels" && channelItems.length === 0) ||
        (tab === "playlists" && playlistItems.length === 0);

    return (
        <AppShell>
            <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
                <Suspense fallback={null}>
                    <SearchTabs active={tab} />
                </Suspense>

                {tab === "videos" ? (
                    <Suspense fallback={null}>
                        <SearchFilters />
                    </Suspense>
                ) : null}

                {!hasQuery ? (
                    <p className="text-muted-foreground">Enter a search query above.</p>
                ) : empty ? (
                    <div className="py-16 text-center">
                        <p className="text-lg font-medium text-foreground">
                            No {tab} results for &ldquo;{q}&rdquo;.
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Try different keywords{tab === "videos" ? " or broaden your filters" : ""}.
                        </p>
                    </div>
                ) : tab === "videos" ? (
                    <ol className="flex flex-col gap-6">
                        {videoItems.map((video) => (
                            <li key={video.id}>
                                <SearchResultCard video={video} />
                            </li>
                        ))}
                    </ol>
                ) : tab === "channels" ? (
                    <ol className="flex flex-col gap-2">
                        {channelItems.map((channel) => (
                            <li key={channel.id}>
                                <SearchChannelCard channel={channel} />
                            </li>
                        ))}
                    </ol>
                ) : (
                    <ol className="flex flex-col gap-2">
                        {playlistItems.map((playlist) => (
                            <li key={playlist.id}>
                                <SearchPlaylistCard playlist={playlist} />
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </AppShell>
    );
};

export default SearchPage;
