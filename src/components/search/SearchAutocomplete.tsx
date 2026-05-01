"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search01Icon, Cancel01Icon, Time04Icon } from "hugeicons-react";

import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { vanillaTrpc } from "@/lib/trpc/client";
import { cn, formatCount, formatDuration, formatRelativeTime } from "@/lib/utils";
import { pushRecentSearch, readRecentSearches, removeRecentSearch, clearRecentSearches } from "@/lib/recent-searches";

interface SearchAutocompleteProps {
    query: string;
    onClose: () => void;
    /** Optional callback fired when a recent query is clicked, so the parent
     *  input can mirror the new value. */
    onSelectRecent?: (query: string) => void;
}

interface VideoSuggestion {
    kind: "video";
    sim: number;
    href: string;
    id: string;
    publicId: string | null;
    title: string;
    description: string;
    thumbnailPath: string | null;
    durationSec: number | null;
    viewCount: number;
    publishedAt: string | Date | null;
    channelId: string;
    channelName: string;
    channelHandle: string;
}
interface ChannelSuggestion {
    kind: "channel";
    sim: number;
    href: string;
    id: string;
    name: string;
    handle: string;
    avatarPath: string | null;
    subscriberCount: number;
    videoCount: number;
}
interface PlaylistSuggestion {
    kind: "playlist";
    sim: number;
    href: string;
    id: string;
    title: string;
    ownerName: string | null;
    itemCount: number;
}

interface SuggestionResponse {
    videos: VideoSuggestion[];
    channels: ChannelSuggestion[];
    playlists: PlaylistSuggestion[];
}

// Tiny inline highlighter — splits `query` on whitespace and wraps every
// case-insensitive match of any token with a <mark>. Splitting matters so a
// query like "smoke s" highlights "smoke" and "s" independently rather than
// only the literal "smoke s" substring. Escapes regex metacharacters so a
// query of "c++" doesn't blow up.
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const Highlight = ({ text, query }: { text: string; query: string }) => {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || !text) return <>{text}</>;
    const re = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
    const parts = text.split(re);
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <mark key={i} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
                        {part}
                    </mark>
                ) : (
                    <span key={i}>{part}</span>
                ),
            )}
        </>
    );
};

const useDebounce = <T,>(value: T, delayMs: number): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(id);
    }, [value, delayMs]);
    return debounced;
};

interface PendingRow {
    type: "recent" | "video" | "channel" | "playlist" | "search-for";
    label: string;
    href: string;
}

export const SearchAutocomplete = ({ query, onClose, onSelectRecent }: SearchAutocompleteProps) => {
    const router = useRouter();
    const trimmedQuery = query.trim();
    // Short debounce keeps the autocomplete feeling live while still
    // collapsing rapid keystrokes into a single network round-trip.
    // Previous results stay visible across queries via placeholderData below.
    const debouncedQuery = useDebounce(trimmedQuery, 120);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [recents, setRecents] = useState<string[]>([]);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setRecents(readRecentSearches());
    }, []);

    const { data: suggestions } = useQuery<SuggestionResponse>({
        queryKey: ["search.autocomplete", debouncedQuery],
        queryFn: async () => {
            if (debouncedQuery.length < 2) return { videos: [], channels: [], playlists: [] };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (vanillaTrpc as any).search.autocomplete.query({ q: debouncedQuery });
            return result as SuggestionResponse;
        },
        enabled: debouncedQuery.length >= 2,
        staleTime: 30_000,
        placeholderData: (prev: SuggestionResponse | undefined) => prev,
    });

    const videos = suggestions?.videos ?? [];
    const channels = suggestions?.channels ?? [];
    const playlists = suggestions?.playlists ?? [];

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
        videos.forEach((v) => out.push({ type: "video", label: v.title, href: v.href }));
        channels.forEach((c) => out.push({ type: "channel", label: c.name, href: c.href }));
        playlists.forEach((p) => out.push({ type: "playlist", label: p.title, href: p.href }));
        return out;
    }, [trimmedQuery, recents, videos, channels, playlists]);

    useEffect(() => {
        setActiveIndex(-1);
    }, [rows.length, debouncedQuery]);

    const commitNavigation = useCallback(
        (row: PendingRow) => {
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

    if (!trimmedQuery && recents.length === 0) {
        return <div className="px-3 py-3 text-sm text-muted-foreground">Start typing to search&hellip;</div>;
    }

    let rowIndex = 0;

    return (
        <div ref={listRef} role="listbox" aria-label="Search suggestions" className="max-h-[70vh] overflow-y-auto py-1">
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

            {trimmedQuery && (
                <>
                    {(() => {
                        const i = rowIndex++;
                        return (
                            <SearchForRow
                                key="search-for"
                                query={trimmedQuery}
                                href={`/search?q=${encodeURIComponent(trimmedQuery)}`}
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

                    {videos.length > 0 && (
                        <SectionHeader>Videos</SectionHeader>
                    )}
                    {videos.map((v) => {
                        const i = rowIndex++;
                        return (
                            <VideoRow
                                key={`video-${v.id}`}
                                video={v}
                                query={trimmedQuery}
                                active={i === activeIndex}
                                onClick={() =>
                                    commitNavigation({ type: "video", label: v.title, href: v.href })
                                }
                            />
                        );
                    })}

                    {channels.length > 0 && <SectionHeader>Channels</SectionHeader>}
                    {channels.map((c) => {
                        const i = rowIndex++;
                        return (
                            <ChannelRow
                                key={`channel-${c.id}`}
                                channel={c}
                                query={trimmedQuery}
                                active={i === activeIndex}
                                onClick={() =>
                                    commitNavigation({ type: "channel", label: c.name, href: c.href })
                                }
                            />
                        );
                    })}

                    {playlists.length > 0 && <SectionHeader>Playlists</SectionHeader>}
                    {playlists.map((p) => {
                        const i = rowIndex++;
                        return (
                            <PlaylistRow
                                key={`playlist-${p.id}`}
                                playlist={p}
                                query={trimmedQuery}
                                active={i === activeIndex}
                                onClick={() =>
                                    commitNavigation({ type: "playlist", label: p.title, href: p.href })
                                }
                            />
                        );
                    })}
                </>
            )}
        </div>
    );
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-1 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
    </p>
);

interface RowShellProps {
    href: string;
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}

const RowShell = ({ href, active, onClick, children }: RowShellProps) => (
    <Link
        href={href}
        role="option"
        aria-selected={active}
        onClick={(e) => {
            e.preventDefault();
            onClick();
        }}
        className={cn(
            "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
            "hover:bg-accent",
            active && "bg-accent",
        )}
    >
        {children}
    </Link>
);

const SearchForRow = ({
    query,
    href,
    active,
    onClick,
}: {
    query: string;
    href: string;
    active: boolean;
    onClick: () => void;
}) => (
    <RowShell href={href} active={active} onClick={onClick}>
        <Search01Icon size={16} strokeWidth={1.6} className="shrink-0 text-muted-foreground" />
        <span className="truncate">
            Search for <span className="font-semibold">&ldquo;{query}&rdquo;</span>
        </span>
    </RowShell>
);

const VideoRow = ({
    video,
    query,
    active,
    onClick,
}: {
    video: VideoSuggestion;
    query: string;
    active: boolean;
    onClick: () => void;
}) => {
    const thumb = video.thumbnailPath ? `/api/hls/${video.id}/thumb/sprite.jpg` : null;
    const published = video.publishedAt ? formatRelativeTime(new Date(video.publishedAt)) : null;
    return (
        <RowShell href={video.href} active={active} onClick={onClick}>
            <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
                {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : null}
                {video.durationSec != null && video.durationSec > 0 && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/85 px-1 text-[9px] font-medium tabular-nums text-white">
                        {formatDuration(video.durationSec)}
                    </span>
                )}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                    <Highlight text={video.title} query={query} />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                    <Highlight text={video.channelName} query={query} />
                    <span aria-hidden="true"> · </span>
                    {formatCount(video.viewCount)} views
                    {published && (
                        <>
                            <span aria-hidden="true"> · </span>
                            {published}
                        </>
                    )}
                </p>
                {video.description && (
                    <p className="line-clamp-1 text-xs text-muted-foreground/80">
                        <Highlight text={video.description.slice(0, 140)} query={query} />
                    </p>
                )}
            </div>
        </RowShell>
    );
};

const ChannelRow = ({
    channel,
    query,
    active,
    onClick,
}: {
    channel: ChannelSuggestion;
    query: string;
    active: boolean;
    onClick: () => void;
}) => {
    const avatar = channel.avatarPath ? `/api/channel/${channel.id}/asset/avatar` : null;
    return (
        <RowShell href={channel.href} active={active} onClick={onClick}>
            <span className="relative inline-block h-10 w-10 shrink-0 overflow-hidden rounded-full">
                <InitialsAvatar name={channel.name} seed={channel.handle} size={40} />
                {avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                )}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium text-foreground">
                    <Highlight text={channel.name} query={query} />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                    @<Highlight text={channel.handle} query={query} />
                    <span aria-hidden="true"> · </span>
                    {formatCount(channel.subscriberCount)} subscriber
                    {channel.subscriberCount !== 1 ? "s" : ""}
                    <span aria-hidden="true"> · </span>
                    {formatCount(channel.videoCount)} video{channel.videoCount !== 1 ? "s" : ""}
                </p>
            </div>
        </RowShell>
    );
};

const PlaylistRow = ({
    playlist,
    query,
    active,
    onClick,
}: {
    playlist: PlaylistSuggestion;
    query: string;
    active: boolean;
    onClick: () => void;
}) => (
    <RowShell href={playlist.href} active={active} onClick={onClick}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
            <Time04Icon size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-medium text-foreground">
                <Highlight text={playlist.title} query={query} />
            </p>
            <p className="truncate text-xs text-muted-foreground">
                {playlist.itemCount} video{playlist.itemCount !== 1 ? "s" : ""}
                {playlist.ownerName && (
                    <>
                        <span aria-hidden="true"> · </span>
                        by {playlist.ownerName}
                    </>
                )}
            </p>
        </div>
    </RowShell>
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
            "hover:bg-accent",
            active && "bg-accent",
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
