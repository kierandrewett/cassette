"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";

import { ArrowDown, ArrowUp, BookmarkPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addToWatchLater, removePlaylistItem, reorderPlaylistItems } from "@/app/playlist/actions";
import { formatDuration } from "@/lib/utils";

interface PlaylistItem {
    itemId: string;
    position: number;
    video: {
        id: string;
        title: string;
        thumbnailPath: string | null;
        durationSec: number | null;
    };
    channel: {
        name: string;
        handle: string;
    };
}

interface PlaylistItemListProps {
    playlistId: string;
    items: PlaylistItem[];
    isOwner: boolean;
    /** Callback fired after a successful mutation (e.g. to trigger a page refresh). */
    onMutated: () => void;
}

// List of playlist items with remove / save-to-watch-later / move-up / move-down controls.
// Full drag-and-drop reorder is M9 polish; v1 uses up/down arrow buttons.
export const PlaylistItemList = ({ playlistId, items: initialItems, isOwner, onMutated }: PlaylistItemListProps) => {
    const [items, setItems] = useState<PlaylistItem[]>(initialItems);
    const [busyItemId, setBusyItemId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleRemove = (itemId: string) => {
        setBusyItemId(itemId);
        startTransition(async () => {
            const result = await removePlaylistItem(itemId);
            if (result.ok) {
                toast.success("Removed from playlist.");
                setItems((prev) => prev.filter((it) => it.itemId !== itemId));
                onMutated();
            } else {
                toast.error(result.error ?? "Failed to remove item.");
            }
            setBusyItemId(null);
        });
    };

    const handleMove = (index: number, direction: "up" | "down") => {
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= items.length) return;

        const newItems = [...items];
        const a = newItems[index]!;
        const b = newItems[swapIndex]!;
        newItems[index] = b;
        newItems[swapIndex] = a;

        setItems(newItems);
        setBusyItemId(a.itemId);

        startTransition(async () => {
            const result = await reorderPlaylistItems(
                playlistId,
                newItems.map((it) => it.itemId),
            );
            if (!result.ok) {
                toast.error(result.error ?? "Failed to reorder.");
                setItems(items); // revert
            }
            setBusyItemId(null);
        });
    };

    const handleWatchLater = (videoId: string, itemId: string) => {
        setBusyItemId(itemId);
        startTransition(async () => {
            const result = await addToWatchLater(videoId);
            if (result.ok) {
                toast.success("Added to Watch Later.");
            } else {
                toast.error(result.error ?? "Failed to add to Watch Later.");
            }
            setBusyItemId(null);
        });
    };

    if (items.length === 0) {
        return (
            <p className="py-12 text-center text-sm text-muted-foreground">
                This playlist is empty. Add videos to get started.
            </p>
        );
    }

    return (
        <ol className="space-y-1">
            {items.map((item, index) => {
                const thumbSrc = item.video.thumbnailPath
                    ? `/api/hls/${item.video.id}/thumb/sprite.jpg`
                    : null;
                const isBusy = busyItemId === item.itemId || isPending;

                return (
                    <li
                        key={item.itemId}
                        className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/50"
                    >
                        {/* Position number */}
                        <span className="w-5 flex-shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                            {index + 1}
                        </span>

                        {/* Thumbnail */}
                        <Link
                            href={`/watch/${item.video.id}`}
                            className="relative flex-shrink-0 overflow-hidden rounded-md bg-secondary"
                            style={{ width: 120, height: 68 }}
                        >
                            {thumbSrc ? (
                                <Image
                                    src={thumbSrc}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="120px"
                                />
                            ) : (
                                <div className="h-full w-full bg-secondary" />
                            )}
                            {item.video.durationSec != null && item.video.durationSec > 0 && (
                                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white tabular-nums">
                                    {formatDuration(item.video.durationSec)}
                                </span>
                            )}
                        </Link>

                        {/* Meta */}
                        <div className="min-w-0 flex-1">
                            <Link
                                href={`/watch/${item.video.id}`}
                                className="line-clamp-2 text-sm font-medium text-foreground hover:underline"
                            >
                                {item.video.title}
                            </Link>
                            <p className="text-xs text-muted-foreground truncate">{item.channel.name}</p>
                        </div>

                        {/* Actions — visible on hover */}
                        {isOwner && (
                            <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                    type="button"
                                    title="Move up"
                                    disabled={index === 0 || isBusy}
                                    onClick={() => handleMove(index, "up")}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Move down"
                                    disabled={index === items.length - 1 || isBusy}
                                    onClick={() => handleMove(index, "down")}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Save to Watch Later"
                                    disabled={isBusy}
                                    onClick={() => handleWatchLater(item.video.id, item.itemId)}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <BookmarkPlus className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Remove from playlist"
                                    disabled={isBusy}
                                    onClick={() => handleRemove(item.itemId)}
                                    className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
};
