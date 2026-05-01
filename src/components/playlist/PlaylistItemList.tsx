"use client";

import { useRef, useState, useTransition } from "react";

import Image from "next/image";
import Link from "next/link";

import { ArrowDown, ArrowUp, BookmarkPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addToWatchLater, removePlaylistItem, reorderPlaylistItems } from "@/app/playlist/actions";
import { cn } from "@/lib/utils";
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

// List of playlist items with remove / save-to-watch-later / HTML5 DnD reorder controls.
// Up/down arrow buttons remain visible on mobile (< md) as a fallback.
export const PlaylistItemList = ({ playlistId, items: initialItems, isOwner, onMutated }: PlaylistItemListProps) => {
    const [items, setItems] = useState<PlaylistItem[]>(initialItems);
    const [busyItemId, setBusyItemId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    // ---------------------------------------------------------------------------
    // Drag-and-drop state
    // ---------------------------------------------------------------------------

    const dragItemId = useRef<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, itemId: string) => {
        dragItemId.current = itemId;
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent<HTMLLIElement>, itemId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOverId(itemId);
    };

    const handleDragLeave = () => {
        setDragOverId(null);
    };

    const handleDrop = (e: React.DragEvent<HTMLLIElement>, targetItemId: string) => {
        e.preventDefault();
        setDragOverId(null);

        const sourceId = dragItemId.current;
        if (!sourceId || sourceId === targetItemId) return;

        const sourceIndex = items.findIndex((it) => it.itemId === sourceId);
        const targetIndex = items.findIndex((it) => it.itemId === targetItemId);
        if (sourceIndex === -1 || targetIndex === -1) return;

        const newItems = [...items];
        const [removed] = newItems.splice(sourceIndex, 1);
        newItems.splice(targetIndex, 0, removed!);

        setItems(newItems);
        setBusyItemId(sourceId);

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

    const handleDragEnd = () => {
        dragItemId.current = null;
        setDragOverId(null);
    };

    // ---------------------------------------------------------------------------
    // Up/down move (mobile fallback)
    // ---------------------------------------------------------------------------

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

    // ---------------------------------------------------------------------------
    // Remove / Watch Later
    // ---------------------------------------------------------------------------

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

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

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
                const thumbSrc = item.video.thumbnailPath ? `/api/hls/${item.video.id}/thumb/sprite.jpg` : null;
                const isBusy = busyItemId === item.itemId || isPending;
                const isDragTarget = dragOverId === item.itemId;

                return (
                    <li
                        key={item.itemId}
                        draggable={isOwner}
                        onDragStart={(e) => handleDragStart(e, item.itemId)}
                        onDragOver={(e) => handleDragOver(e, item.itemId)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, item.itemId)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                            "group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/50",
                            isOwner && "cursor-grab active:cursor-grabbing",
                            isDragTarget && "border-t-2 border-primary",
                        )}
                    >
                        {/* Position number */}
                        <span className="w-5 flex-shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                        </span>

                        {/* Thumbnail */}
                        <Link
                            href={`/watch/${item.video.id}`}
                            className="relative flex-shrink-0 overflow-hidden rounded-md bg-secondary"
                            style={{ width: 120, height: 68 }}
                        >
                            {thumbSrc ? (
                                <Image src={thumbSrc} alt="" fill className="object-cover" sizes="120px" />
                            ) : (
                                <div className="h-full w-full bg-secondary" />
                            )}
                            {item.video.durationSec != null && item.video.durationSec > 0 && (
                                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium tabular-nums text-white">
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
                            <p className="truncate text-xs text-muted-foreground">{item.channel.name}</p>
                        </div>

                        {/* Actions */}
                        {isOwner && (
                            <div className="flex flex-shrink-0 items-center gap-1">
                                {/* Up/down: always visible on small screens, hidden on md+ (DnD takes over) */}
                                <button
                                    type="button"
                                    title="Move up"
                                    disabled={index === 0 || isBusy}
                                    onClick={() => handleMove(index, "up")}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 md:hidden"
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Move down"
                                    disabled={index === items.length - 1 || isBusy}
                                    onClick={() => handleMove(index, "down")}
                                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 md:hidden"
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </button>

                                {/* Watch Later + Remove: show on hover (md+) */}
                                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
                            </div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
};
