"use client";

import { useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { cn, formatDuration } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueItem {
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

interface QueueRowProps {
    playlistId: string;
    initialItems: QueueItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const QueueRow = ({ playlistId, initialItems }: QueueRowProps) => {
    const [items, setItems] = useState<QueueItem[]>(initialItems);
    const [busyItemId, setBusyItemId] = useState<string | null>(null);

    const dragItemId = useRef<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    const utils = api.useUtils();

    const reorder = api.playlist.reorder.useMutation({
        onError: (err) => {
            toast.error(err.message ?? "Failed to reorder queue.");
        },
        onSettled: async () => {
            await utils.playlist.queue.list.invalidate();
        },
    });

    const removeItem = api.playlist.removeItem.useMutation({
        onSuccess: (data) => {
            setItems((prev) => prev.filter((it) => it.itemId !== data.id));
            toast.success("Removed from queue.");
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to remove item.");
        },
        onSettled: async () => {
            await utils.playlist.queue.list.invalidate();
        },
    });

    // ---------------------------------------------------------------------------
    // Drag-and-drop handlers
    // ---------------------------------------------------------------------------

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

    const handleDragLeave = () => setDragOverId(null);

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

        reorder.mutate(
            { playlistId, itemIds: newItems.map((it) => it.itemId) },
            { onSettled: () => setBusyItemId(null) },
        );
    };

    const handleDragEnd = () => {
        dragItemId.current = null;
        setDragOverId(null);
    };

    // ---------------------------------------------------------------------------
    // Up/down (mobile fallback)
    // ---------------------------------------------------------------------------

    const handleMove = (index: number, direction: "up" | "down") => {
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= items.length) return;

        const newItems = [...items];
        const a = newItems[index]!;
        const b = newItems[swapIndex]!;
        newItems[index] = b;
        newItems[swapIndex] = a;

        const prevItems = items;
        setItems(newItems);
        setBusyItemId(a.itemId);

        reorder.mutate(
            { playlistId, itemIds: newItems.map((it) => it.itemId) },
            {
                onError: () => setItems(prevItems),
                onSettled: () => setBusyItemId(null),
            },
        );
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    if (items.length === 0) {
        return (
            <p className="px-4 text-sm text-muted-foreground md:px-6">
                Add videos to your queue and they will appear here.
            </p>
        );
    }

    return (
        <ol className="flex gap-3 overflow-x-auto px-4 pb-2 md:px-6" style={{ scrollbarWidth: "none" }}>
            {items.map((item, index) => {
                const thumbSrc = item.video.thumbnailPath ? `/api/hls/${item.video.id}/thumb/sprite.jpg` : null;
                const isBusy = busyItemId === item.itemId || reorder.isPending || removeItem.isPending;
                const isDragTarget = dragOverId === item.itemId;

                return (
                    <li
                        key={item.itemId}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.itemId)}
                        onDragOver={(e) => handleDragOver(e, item.itemId)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, item.itemId)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                            "group relative w-48 flex-shrink-0 cursor-grab rounded-xl border border-border bg-card active:cursor-grabbing",
                            isDragTarget && "border-l-2 border-l-primary",
                        )}
                    >
                        {/* Thumbnail */}
                        <Link
                            href={`/watch/${item.video.id}`}
                            className="relative block aspect-video overflow-hidden rounded-t-xl bg-secondary"
                        >
                            {thumbSrc ? (
                                <Image src={thumbSrc} alt="" fill className="object-cover" sizes="192px" />
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
                        <div className="p-2">
                            <Link
                                href={`/watch/${item.video.id}`}
                                className="line-clamp-2 text-xs font-medium text-foreground hover:underline"
                            >
                                {item.video.title}
                            </Link>
                            <p className="truncate text-[11px] text-muted-foreground">{item.channel.name}</p>
                        </div>

                        {/* Overlay controls (shown on hover) */}
                        <div className="absolute right-1 top-1 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                                type="button"
                                title="Remove from queue"
                                disabled={isBusy}
                                onClick={() => removeItem.mutate({ itemId: item.itemId })}
                                className="flex h-6 w-6 items-center justify-center rounded bg-black/70 text-white hover:bg-black disabled:opacity-40"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>

                            {/* Up/down: mobile fallback — always visible on small screens */}
                            <button
                                type="button"
                                title="Move up"
                                disabled={index === 0 || isBusy}
                                onClick={() => handleMove(index, "up")}
                                className="flex h-6 w-6 items-center justify-center rounded bg-black/70 text-white hover:bg-black disabled:opacity-40 md:hidden"
                            >
                                <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                title="Move down"
                                disabled={index === items.length - 1 || isBusy}
                                onClick={() => handleMove(index, "down")}
                                className="flex h-6 w-6 items-center justify-center rounded bg-black/70 text-white hover:bg-black disabled:opacity-40 md:hidden"
                            >
                                <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
};
