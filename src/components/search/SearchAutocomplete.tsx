"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search01Icon, Cancel01Icon, PlaySquareIcon, UserMultipleIcon, LibraryIcon, Time04Icon } from "hugeicons-react";

import { vanillaTrpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { pushRecentSearch, readRecentSearches, removeRecentSearch, clearRecentSearches } from "@/lib/recent-searches";

interface SearchAutocompleteProps {
    query: string;
    onClose: () => void;
    /** Optional callback fired when a recent query is clicked, so the parent
     *  input can mirror the new value. */
    onSelectRecent?: (query: string) => void;
}

type Suggestion = {
    kind: "video" | "channel" | "playlist";
    label: string;
    href: string;
};

// Fixed sub-heading per kind. We render groups in a stable order so the rows
// don't reshuffle as the server's similarity ranking jitters.
const KIND_HEADINGS: Record<Suggestion["kind"], string> = {
    video: "Videos",
    channel: "Channels",
    playlist: "Playlists",
};

const KindIcon = ({ kind, className }: { kind: Suggestion["kind"]; className?: string }) => {
    const props = { size: 16, strokeWidth: 1.6, className };
    switch (kind) {
        case "video":
            return <PlaySquareIcon {...props} />;
        case "channel":
            return <UserMultipleIcon {...props} />;
        case "playlist":
            return <LibraryIcon {...props} />;
    }
};

// Debounce helper — delays propagation of `value` until `delayMs` has elapsed
// without further updates.
const useDebounce = <T,>(value: T, delayMs: number): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(id);
    }, [value, delayMs]);
    return debounced;
};

interface PendingRow {
    type: "recent" | "suggestion" | "search-for";
    label: string;
    href: string;
    kind?: Suggestion["kind"];
}

export const SearchAutocomplete = ({ query, onClose, onSelectRecent }: SearchAutocompleteProps) => {
    const router = useRouter();
    const trimmedQuery = query.trim();
    const debouncedQuery = useDebounce(trimmedQuery, 200);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [recents, setRecents] = useState<string[]>([]);
    const listRef = useRef<HTMLDivElement>(null);

    // Hydrate recent searches once on mount; localStorage is browser-only.
    useEffect(() => {
        setRecents(readRecentSearches());
    }, []);

    const { data: suggestions = [] } = useQuery<Suggestion[]>({
        queryKey: ["search.autocomplete", debouncedQuery],
        queryFn: async () => {
            if (debouncedQuery.length < 2) return [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (vanillaTrpc as any).search.autocomplete.query({ q: debouncedQuery });
            return result as Suggestion[];
        },
        enabled: debouncedQuery.length >= 2,
        staleTime: 30_000,
        placeholderData: (prev: Suggestion[] | undefined) => prev,
    });

    // Group suggestions by kind so we can render sub-headers between them.
    const grouped = useMemo(() => {
        const groups: Record<Suggestion["kind"], Suggestion[]> = {
            video: [],
            channel: [],
            playlist: [],
        };
        for (const s of suggestions) {
            groups[s.kind].push(s);
        }
        return groups;
    }, [suggestions]);

    // Flat list of focusable rows in render order. Drives arrow-key navigation
    // without re-deriving indices from the DOM.
    const rows = useMemo<PendingRow[]>(() => {
        if (!trimmedQuery) {
            return recents.map((r) => ({
                type: "recent" as const,
                label: r,
                href: `/search?q=${encodeURIComponent(r)}`,
            }));
        }
        const out: PendingRow[] = [];
        out.push({
            type: "search-for",
            label: trimmedQuery,
            href: `/search?q=${encodeURIComponent(trimmedQuery)}`,
        });
        for (const kind of ["video", "channel", "playlist"] as const) {
            for (const s of grouped[kind].slice(0, 8)) {
                out.push({ type: "suggestion", label: s.label, href: s.href, kind });
            }
        }
        return out;
    }, [trimmedQuery, recents, grouped]);

    // Reset active index when the row set changes.
    useEffect(() => {
        setActiveIndex(-1);
    }, [rows.length, debouncedQuery]);

    const commitNavigation = useCallback(
        (row: PendingRow) => {
            // Only the freeform "search for X" path counts as a recent search;
            // direct suggestion clicks should not pollute the list.
            if (row.type === "search-for") {
                setRecents(pushRecentSearch(row.label));
            }
            onClose();
            router.push(row.href);
        },
        [onClose, router],
    );

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!rows.length) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, -1));
            } else if (e.key === "Enter" && activeIndex >= 0) {
                e.preventDefault();
                const row = rows[activeIndex];
                if (row) commitNavigation(row);
            } else if (e.key === "Escape") {
                onClose();
            }
        },
        [rows, activeIndex, commitNavigation, onClose],
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // Empty state — no query, no recents.
    if (!trimmedQuery && recents.length === 0) {
        return <div className="px-3 py-3 text-sm text-muted-foreground">Start typing to search&hellip;</div>;
    }

    let rowIndex = 0;

    return (
        <div ref={listRef} role="listbox" aria-label="Search suggestions" className="max-h-[60vh] overflow-y-auto py-1">
            {/* Recents — only visible when the input is empty. */}
            {!trimmedQuery && recents.length > 0 && (
                <>
                    <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Recent
                        </span>
                        <button
                            type="button"
                            onClick={() => setRecents(clearRecentSearches())}
                            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                        >
                            Clear all
                        </button>
                    </div>
                    {recents.map((r) => {
                        const i = rowIndex++;
                        return (
                            <RecentRow
                                key={`recent-${r}`}
                                query={r}
                                active={i === activeIndex}
                                onSelect={() => {
                                    onSelectRecent?.(r);
                                    commitNavigation({
                                        type: "recent",
                                        label: r,
                                        href: `/search?q=${encodeURIComponent(r)}`,
                                    });
                                }}
                                onRemove={() => setRecents(removeRecentSearch(r))}
                            />
                        );
                    })}
                </>
            )}

            {/* Active query — show "search for X" + grouped suggestions. */}
            {trimmedQuery && (
                <>
                    {(() => {
                        const i = rowIndex++;
                        return (
                            <SuggestionRow
                                key="search-for"
                                href={`/search?q=${encodeURIComponent(trimmedQuery)}`}
                                label={
                                    <>
                                        Search for <span className="font-semibold">&ldquo;{trimmedQuery}&rdquo;</span>
                                    </>
                                }
                                Icon={
                                    <Search01Icon
                                        size={16}
                                        strokeWidth={1.6}
                                        className="shrink-0 text-muted-foreground"
                                    />
                                }
                                active={i === activeIndex}
                                onClick={() =>
                                    commitNavigation({
                                        type: "search-for",
                                        label: trimmedQuery,
                                        href: `/search?q=${encodeURIComponent(trimmedQuery)}`,
                                    })
                                }
                            />
                        );
                    })()}

                    {(["video", "channel", "playlist"] as const).map((kind) => {
                        const list = grouped[kind].slice(0, 8);
                        if (list.length === 0) return null;
                        return (
                            <div key={kind} className="mt-1">
                                <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {KIND_HEADINGS[kind]}
                                </p>
                                {list.map((s) => {
                                    const i = rowIndex++;
                                    return (
                                        <SuggestionRow
                                            key={`${kind}-${s.href}`}
                                            href={s.href}
                                            label={s.label}
                                            Icon={<KindIcon kind={kind} className="shrink-0 text-muted-foreground" />}
                                            active={i === activeIndex}
                                            onClick={() =>
                                                commitNavigation({
                                                    type: "suggestion",
                                                    label: s.label,
                                                    href: s.href,
                                                    kind,
                                                })
                                            }
                                        />
                                    );
                                })}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
};

interface SuggestionRowProps {
    href: string;
    label: React.ReactNode;
    Icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
}

const SuggestionRow = ({ href, label, Icon, active, onClick }: SuggestionRowProps) => (
    <Link
        href={href}
        role="option"
        aria-selected={active}
        onClick={(e) => {
            e.preventDefault();
            onClick();
        }}
        className={cn(
            "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            active && "bg-accent text-accent-foreground",
        )}
    >
        {Icon}
        <span className="truncate">{label}</span>
    </Link>
);

interface RecentRowProps {
    query: string;
    active: boolean;
    onSelect: () => void;
    onRemove: () => void;
}

const RecentRow = ({ query, active, onSelect, onRemove }: RecentRowProps) => (
    <div
        role="option"
        aria-selected={active}
        className={cn(
            "group flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            active && "bg-accent text-accent-foreground",
        )}
    >
        <Time04Icon size={16} strokeWidth={1.6} className="shrink-0 text-muted-foreground" />
        <button type="button" onClick={onSelect} className="flex-1 truncate text-left">
            {query}
        </button>
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onRemove();
            }}
            aria-label={`Remove ${query} from recent searches`}
            className="ml-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
        >
            <Cancel01Icon size={14} strokeWidth={1.6} />
        </button>
    </div>
);
