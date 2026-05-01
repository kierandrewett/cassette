"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChapterRow {
    /** Unique key for React (not persisted). */
    key: string;
    startSec: number;
    title: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextKey = 0;
const nextKey = () => String(++_nextKey);

/** Parse mm:ss or m:ss → seconds. Returns NaN on invalid input. */
const parseTime = (raw: string): number => {
    const parts = raw.trim().split(":");
    if (parts.length !== 2) return NaN;
    const [mStr, sStr] = parts;
    const m = parseInt(mStr ?? "0", 10);
    const s = parseInt(sStr ?? "0", 10);
    if (isNaN(m) || isNaN(s) || s < 0 || s > 59) return NaN;
    return m * 60 + s;
};

/** Format seconds → mm:ss. */
const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChapterEditorProps {
    videoId: string;
    /** Existing chapters (all sources) loaded by the parent. */
    initialChapters: Array<{ startSec: number; title: string; source: string }>;
    channelId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChapterEditor = ({ videoId, initialChapters, channelId }: ChapterEditorProps) => {
    const utils = api.useUtils();

    // Seed with the existing manual chapters on first render.
    const [rows, setRows] = useState<ChapterRow[]>(() =>
        initialChapters
            .filter((c) => c.source === "manual")
            .sort((a, b) => a.startSec - b.startSec)
            .map((c) => ({ key: nextKey(), startSec: c.startSec, title: c.title })),
    );

    // Re-seed when the dialog opens for a different video.
    const prevVideoId = useRef(videoId);
    useEffect(() => {
        if (prevVideoId.current === videoId) return;
        prevVideoId.current = videoId;
        setRows(
            initialChapters
                .filter((c) => c.source === "manual")
                .sort((a, b) => a.startSec - b.startSec)
                .map((c) => ({ key: nextKey(), startSec: c.startSec, title: c.title })),
        );
    }, [videoId, initialChapters]);

    // Time input state (string so the user can type freely).
    const [timeInputs, setTimeInputs] = useState<Record<string, string>>(() =>
        Object.fromEntries(rows.map((r) => [r.key, formatTime(r.startSec)])),
    );

    const setChapters = api.video.setChapters.useMutation({
        onSuccess: async () => {
            await utils.video.listForChannel.invalidate({ channelId });
            toast.success("Chapters saved.");
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to save chapters.");
        },
    });

    // ---- Row manipulation ----

    const addRow = () => {
        const key = nextKey();
        const lastSec = rows.length > 0 ? (rows[rows.length - 1]?.startSec ?? 0) + 60 : 0;
        setRows((prev) => [...prev, { key, startSec: lastSec, title: "" }]);
        setTimeInputs((prev) => ({ ...prev, [key]: formatTime(lastSec) }));
    };

    const removeRow = (key: string) => {
        setRows((prev) => prev.filter((r) => r.key !== key));
        setTimeInputs((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const updateTitle = (key: string, title: string) => {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, title } : r)));
    };

    const commitTime = (key: string) => {
        const raw = timeInputs[key] ?? "";
        const sec = parseTime(raw);
        if (!isNaN(sec)) {
            setRows((prev) => prev.map((r) => (r.key === key ? { ...r, startSec: sec } : r)));
            setTimeInputs((prev) => ({ ...prev, [key]: formatTime(sec) }));
        } else {
            // Revert to last valid value.
            const existing = rows.find((r) => r.key === key);
            if (existing) {
                setTimeInputs((prev) => ({ ...prev, [key]: formatTime(existing.startSec) }));
            }
        }
    };

    // ---- Drag-and-drop reorder ----

    const dragKey = useRef<string | null>(null);
    const dragOverKey = useRef<string | null>(null);

    const handleDragStart = useCallback((key: string) => {
        dragKey.current = key;
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, key: string) => {
        e.preventDefault();
        dragOverKey.current = key;
    }, []);

    const handleDrop = useCallback(() => {
        const from = dragKey.current;
        const to = dragOverKey.current;
        if (!from || !to || from === to) return;

        setRows((prev) => {
            const fromIdx = prev.findIndex((r) => r.key === from);
            const toIdx = prev.findIndex((r) => r.key === to);
            if (fromIdx === -1 || toIdx === -1) return prev;
            const next = [...prev];
            const [item] = next.splice(fromIdx, 1);
            if (item) next.splice(toIdx, 0, item);
            return next;
        });

        dragKey.current = null;
        dragOverKey.current = null;
    }, []);

    // ---- Save ----

    const handleSave = () => {
        // Validate: all times must parse, all titles non-empty.
        for (const row of rows) {
            if (!row.title.trim()) {
                toast.error("All chapters must have a title.");
                return;
            }
        }

        setChapters.mutate({
            videoId,
            chapters: rows.map((r) => ({ startSec: r.startSec, title: r.title.trim() })),
        });
    };

    // ---- Render ----

    return (
        <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
                Add manual chapters. These take precedence over any chapters extracted from the video. Start time
                format: <code className="font-mono text-xs">mm:ss</code>.
            </p>

            {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No manual chapters yet. Press &ldquo;Add chapter&rdquo; to start.
                </p>
            ) : (
                <div className="space-y-1" role="list" aria-label="Chapter list">
                    {rows.map((row, idx) => (
                        <div
                            key={row.key}
                            role="listitem"
                            draggable
                            onDragStart={() => handleDragStart(row.key)}
                            onDragOver={(e) => handleDragOver(e, row.key)}
                            onDrop={handleDrop}
                            className={cn(
                                "flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5",
                                "transition-colors hover:border-primary/30",
                            )}
                            aria-label={`Chapter ${idx + 1}`}
                        >
                            {/* Drag handle */}
                            <button
                                type="button"
                                className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
                                aria-label="Drag to reorder"
                                tabIndex={-1}
                            >
                                <GripVertical className="h-4 w-4" aria-hidden="true" />
                            </button>

                            {/* Start time */}
                            <input
                                type="text"
                                inputMode="numeric"
                                value={timeInputs[row.key] ?? ""}
                                onChange={(e) => setTimeInputs((prev) => ({ ...prev, [row.key]: e.target.value }))}
                                onBlur={() => commitTime(row.key)}
                                aria-label={`Start time for chapter ${idx + 1}`}
                                className={cn(
                                    "w-16 rounded-md border border-input bg-transparent px-2 py-1 text-sm tabular-nums",
                                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    "placeholder:text-muted-foreground",
                                )}
                                placeholder="00:00"
                            />

                            {/* Title */}
                            <input
                                type="text"
                                value={row.title}
                                onChange={(e) => updateTitle(row.key, e.target.value)}
                                maxLength={200}
                                aria-label={`Title for chapter ${idx + 1}`}
                                className={cn(
                                    "min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm",
                                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    "placeholder:text-muted-foreground",
                                )}
                                placeholder="Chapter title"
                            />

                            {/* Remove */}
                            <button
                                type="button"
                                onClick={() => removeRow(row.key)}
                                aria-label={`Remove chapter ${idx + 1}`}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
                <button
                    type="button"
                    onClick={addRow}
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5",
                        "text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    )}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add chapter
                </button>

                <button
                    type="button"
                    onClick={handleSave}
                    disabled={setChapters.isPending}
                    className={cn(
                        "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4",
                        "text-sm font-medium text-primary-foreground shadow transition-colors",
                        "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    {setChapters.isPending ? "Saving…" : "Save chapters"}
                </button>
            </div>
        </div>
    );
};
