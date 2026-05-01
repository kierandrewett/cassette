import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";

import AppShell from "@/components/shell/AppShell";
import { SearchFilters } from "@/components/search/SearchFilters";
import { SearchResultCard, type SearchResultVideo } from "@/components/search/SearchResultCard";
import { parseSearchFilters } from "@/components/search/filterParams";
import { createTRPCContext } from "@/server/api/trpc";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { searchRouter } from "@/server/api/routers/search";

interface SearchPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Inline caller for the search sub-router so this page is independent of
// whether root.ts has `search: searchRouter` wired yet (orchestrator step).
const createSearchCaller = createCallerFactory(createTRPCRouter({ search: searchRouter }));

export const generateMetadata = async ({ searchParams }: SearchPageProps): Promise<Metadata> => {
    const resolved = await searchParams;
    const q = typeof resolved.q === "string" ? resolved.q : "";
    return {
        title: q ? `"${q}" — Search` : "Search",
    };
};

// Flatten potential array values from searchParams into strings.
const flattenParams = (params: Record<string, string | string[] | undefined>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
        if (typeof v === "string") out[k] = v;
        else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") out[k] = v[0];
    }
    return out;
};

const SearchPage = async ({ searchParams }: SearchPageProps) => {
    const resolved = await searchParams;
    const flat = flattenParams(resolved);
    const filters = parseSearchFilters(flat);

    const { q, uploadedWithin, duration, hasCaptions } = filters;

    // Build a one-shot caller bound to this request's context.
    const ctx = await createTRPCContext({ headers: await headers() });
    const caller = createSearchCaller(() => Promise.resolve(ctx));

    const result =
        q.trim().length > 0
            ? await caller.search.videos({
                  q: q.trim(),
                  uploadedWithin,
                  duration,
                  hasCaptions,
                  limit: 20,
              })
            : null;

    const items: SearchResultVideo[] = result?.items ?? [];

    return (
        <AppShell>
            <div className="container mx-auto max-w-4xl px-4 py-8">
                {/* Filter chips — client component; reads URL params itself */}
                <Suspense fallback={null}>
                    <div className="mb-6">
                        <SearchFilters />
                    </div>
                </Suspense>

                {/* Result list */}
                {q.trim().length === 0 ? (
                    <p className="text-muted-foreground">Enter a search query above.</p>
                ) : items.length === 0 ? (
                    <div className="py-16 text-center">
                        <p className="text-lg font-medium text-foreground">
                            No results for &ldquo;{q}&rdquo;.
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Try different keywords or broaden your filters.
                        </p>
                    </div>
                ) : (
                    <ol className="flex flex-col gap-6">
                        {items.map((video) => (
                            <li key={video.id}>
                                <SearchResultCard video={video} />
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </AppShell>
    );
};

export default SearchPage;
