"use client";

import { useMemo, useState, useTransition } from "react";

import { toast } from "sonner";

import { HistoryGroup } from "@/components/history/HistoryGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

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

    const handleRemove = (videoId: string) => {
        startTransition(async () => {
            const result = await removeHistoryItem(videoId);
            if (result.ok) {
                setLocalItems((prev) => prev.filter((it) => it.video.id !== videoId));
            } else {
                toast.error(result.error ?? "Failed to remove item.");
            }
        });
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return localItems;
        const q = search.toLowerCase();
        return localItems.filter(
            (it) =>
                it.video.title.toLowerCase().includes(q) ||
                it.channel.name.toLowerCase().includes(q),
        );
    }, [localItems, search]);

    const groups = useMemo(() => groupByDay(filtered), [filtered]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                <h1 className="text-2xl font-semibold text-foreground">Watch History</h1>

                {localItems.length > 0 && (
                    <div>
                        {confirmClear ? (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">Clear all history?</span>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleClear}
                                    disabled={isPending}
                                >
                                    {isPending ? "Clearing..." : "Confirm"}
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
                                className="text-destructive hover:text-destructive"
                                onClick={() => setConfirmClear(true)}
                            >
                                Clear all watch history
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Search filter (client-side only) */}
            <div className="px-4 md:px-6">
                <Input
                    type="search"
                    placeholder="Search watch history..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm"
                />
            </div>

            {/* Day groups */}
            {groups.length === 0 ? (
                <p className="px-4 py-16 text-center text-sm text-muted-foreground md:px-6">
                    {search.trim() ? "No results match your search." : "Your watch history is empty."}
                </p>
            ) : (
                <div className="space-y-4">
                    {groups.map((group) => (
                        <HistoryGroup
                            key={group.label}
                            label={group.label}
                            items={group.items}
                            onRemove={handleRemove}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
