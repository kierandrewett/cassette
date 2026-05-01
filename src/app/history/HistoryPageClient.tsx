"use client";

import { useMemo, useState, useTransition } from "react";

import Image from "next/image";
import Link from "next/link";
import { Clock, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCount, formatDuration, formatRelativeTime } from "@/lib/utils";
import { clearHistory, removeHistoryItem } from "./actions";

interface HistoryItem {
    historyId: string;
    watchedAt: Date;
    video: {
        id: string;
        title: string;
        thumbnailPath: string | null;
        durationSec: number | null;
        viewCount: number;
        publishedAt: Date | null;
    };
    channel: {
        name: string;
        handle: string;
    };
}

interface HistoryPageClientProps {
    initialItems: HistoryItem[];
}

// Group items by calendar day relative to the viewer's local time.
const groupByDay = (items: HistoryItem[]): Array<{ label: string; items: HistoryItem[] }> => {
    const map = new Map<string, HistoryItem[]>();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (a: Date, b: Date): boolean =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    for (const item of items) {
        const d = new Date(item.watchedAt);
        let label: string;
        if (isSameDay(d, today)) {
            label = "Today";
        } else if (isSameDay(d, yesterday)) {
            label = "Yesterday";
        } else {
            label = d.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
            });
        }

        const group = map.get(label) ?? [];
        group.push(item);
        map.set(label, group);
    }

    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
};

const watchTimeOfDay = (d: Date): string =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

interface HistoryRowProps {
    item: HistoryItem;
    onRemove: (historyId: string) => void;
}

// Individual history row: large landscape thumbnail + meta column.
// Watch time of day surfaces under the video meta so the user can tell when
// in the day they watched it (useful for grouped Today / Yesterday).
const HistoryRow = ({ item, onRemove }: HistoryRowProps) => {
    const thumb = item.video.thumbnailPath ? `/api/hls/${item.video.id}/thumb/sprite.jpg` : null;
    return (
        <li className="group relative flex gap-4 rounded-xl p-2 transition-colors hover:bg-secondary/40">
            <Link
                href={`/watch/${item.video.id}`}
                className="relative aspect-video w-56 flex-shrink-0 overflow-hidden rounded-lg bg-secondary"
            >
                {thumb ? (
                    <Image src={thumb} alt="" fill className="object-cover" sizes="224px" />
                ) : (
                    <div className="h-full w-full bg-secondary" />
                )}
                {item.video.durationSec != null && item.video.durationSec > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                        {formatDuration(item.video.durationSec)}
                    </span>
                )}
            </Link>

            <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                <Link
                    href={`/watch/${item.video.id}`}
                    className="line-clamp-2 text-base font-semibold leading-snug text-foreground hover:underline"
                >
                    {item.video.title}
                </Link>
                <Link
                    href={`/@${item.channel.handle}`}
                    className="truncate text-sm text-muted-foreground hover:text-foreground"
                >
                    {item.channel.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                    {formatCount(item.video.viewCount)} views
                    {item.video.publishedAt && (
                        <>
                            {" "}
                            <span aria-hidden="true">·</span> {formatRelativeTime(item.video.publishedAt)}
                        </>
                    )}
                </p>
                <p className="text-xs text-muted-foreground/80">
                    Watched at {watchTimeOfDay(new Date(item.watchedAt))}
                </p>
            </div>

            <button
                type="button"
                onClick={() => onRemove(item.historyId)}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                title="Remove from history"
                aria-label="Remove from history"
            >
                <X className="h-4 w-4" strokeWidth={2} />
            </button>
        </li>
    );
};

export const HistoryPageClient = ({ initialItems }: HistoryPageClientProps) => {
    const [search, setSearch] = useState("");
    const [localItems, setLocalItems] = useState<HistoryItem[]>(initialItems);
    const [confirmClear, setConfirmClear] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleClear = () => {
        startTransition(async () => {
            const result = await clearHistory();
            if (result.ok) {
                toast.success("Watch history cleared.");
                setLocalItems([]);
                setConfirmClear(false);
            } else {
                toast.error(result.error ?? "Failed to clear history.");
            }
        });
    };

    const handleRemove = (historyId: string) => {
        startTransition(async () => {
            const result = await removeHistoryItem(historyId);
            if (result.ok) {
                setLocalItems((prev) => prev.filter((it) => it.historyId !== historyId));
            } else {
                toast.error(result.error ?? "Failed to remove item.");
            }
        });
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return localItems;
        const q = search.toLowerCase();
        return localItems.filter(
            (it) => it.video.title.toLowerCase().includes(q) || it.channel.name.toLowerCase().includes(q),
        );
    }, [localItems, search]);

    const groups = useMemo(() => groupByDay(filtered), [filtered]);

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8">
            {/* Header — heading on the left, search + clear inline on the
                right at md+. Drops the previous card-stacked sidebar so
                the page reads as one column with chrome that gets out of
                the way. */}
            <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <span
                        aria-hidden="true"
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                    >
                        <Clock className="h-6 w-6" strokeWidth={1.6} />
                    </span>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Watch history</h1>
                        <p className="text-sm text-muted-foreground">
                            {localItems.length} {localItems.length === 1 ? "video" : "videos"} watched
                            {search && ` · showing ${filtered.length}`}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 md:flex-none md:w-72">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            strokeWidth={1.6}
                        />
                        <Input
                            type="search"
                            placeholder="Search watch history"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {localItems.length > 0 &&
                        (confirmClear ? (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">Clear everything?</span>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleClear}
                                    disabled={isPending}
                                >
                                    {isPending ? "Clearing…" : "Confirm"}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirmClear(false)}
                                    disabled={isPending}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmClear(true)}
                                className="gap-2 text-destructive hover:text-destructive"
                            >
                                <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                                Clear all
                            </Button>
                        ))}
                </div>
            </header>

            {groups.length === 0 ? (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
                    <span
                        aria-hidden="true"
                        className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                    >
                        <Clock className="h-8 w-8" strokeWidth={1.4} />
                    </span>
                    <div className="space-y-1">
                        <p className="text-base font-semibold text-foreground">
                            {search.trim() ? "Nothing matches your search" : "Your watch history is empty"}
                        </p>
                        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                            {search.trim()
                                ? "Try a different keyword, or clear the search to see everything."
                                : "Videos you watch will appear here so you can pick up where you left off."}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-10">
                    {groups.map((group) => (
                        <section key={group.label} className="space-y-3">
                            <h2 className="sticky top-14 z-10 -mx-2 bg-background px-2 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                {group.label}
                            </h2>
                            <ul className="space-y-1">
                                {group.items.map((item) => (
                                    <HistoryRow key={item.historyId} item={item} onRemove={handleRemove} />
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
};
