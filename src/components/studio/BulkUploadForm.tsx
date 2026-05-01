"use client";

import { useCallback, useRef, useState } from "react";

import Link from "next/link";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChannelInfo = {
    id: string;
    handle: string;
};

type BulkUploadFormProps = {
    channel: ChannelInfo;
};

type PrivacyValue = "public" | "unlisted" | "private";

type FileStatus = "queued" | "uploading" | "transcoding" | "ready" | "failed";

interface FileEntry {
    id: string; // stable key
    file: File;
    title: string;
    description: string;
    tags: string;
    privacy: PrivacyValue;
    status: FileStatus;
    progress: number; // 0-100
    errorMessage: string | null;
    videoId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatFileSize = (bytes: number): string => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${bytes} B`;
};

const stripExtension = (filename: string): string => filename.replace(/\.[^.]+$/, "");

let _idCounter = 0;
const nextId = (): string => `bulk-${Date.now()}-${++_idCounter}`;

const POLL_INTERVAL_MS = 2_000;
const MAX_CONCURRENT = 2;

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const statusBadgeClass = (status: FileStatus): string => {
    switch (status) {
        case "ready":
            return "text-green-400 bg-green-500/10";
        case "failed":
            return "text-destructive bg-destructive/10";
        case "uploading":
        case "transcoding":
            return "text-yellow-400 bg-yellow-500/10";
        default:
            return "text-muted-foreground bg-muted";
    }
};

const statusLabel: Record<FileStatus, string> = {
    queued: "Queued",
    uploading: "Uploading",
    transcoding: "Transcoding",
    ready: "Ready",
    failed: "Failed",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const BulkUploadForm = ({ channel }: BulkUploadFormProps) => {
    const utils = api.useUtils();
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [started, setStarted] = useState(false);
    const [allDone, setAllDone] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    // Map of entryId -> XHR so we can abort individual uploads.
    const xhrMap = useRef<Map<string, XMLHttpRequest>>(new Map());

    // ---------------------------------------------------------------------------
    // Mutation helpers (via tRPC utils for polling)
    // ---------------------------------------------------------------------------

    const pollTranscode = useCallback(
        (entryId: string, videoId: string) => {
            let attempts = 0;
            const maxAttempts = 900;

            const poll = async () => {
                if (attempts++ >= maxAttempts) {
                    setEntries((prev) =>
                        prev.map((e) =>
                            e.id === entryId
                                ? { ...e, status: "failed", errorMessage: "Transcoding timed out." }
                                : e,
                        ),
                    );
                    return;
                }

                try {
                    const status = await utils.video.uploadStatus.fetch({ videoId });

                    if (!status) {
                        setTimeout(() => void poll(), POLL_INTERVAL_MS);
                        return;
                    }

                    if (status.state === "completed") {
                        setEntries((prev) =>
                            prev.map((e) => (e.id === entryId ? { ...e, status: "ready", progress: 100 } : e)),
                        );
                        return;
                    }

                    if (status.state === "failed") {
                        setEntries((prev) =>
                            prev.map((e) =>
                                e.id === entryId
                                    ? { ...e, status: "failed", errorMessage: status.message ?? "Transcoding failed." }
                                    : e,
                            ),
                        );
                        return;
                    }

                    // Still in progress
                    setEntries((prev) =>
                        prev.map((e) =>
                            e.id === entryId ? { ...e, status: "transcoding", progress: status.progress ?? 0 } : e,
                        ),
                    );
                    setTimeout(() => void poll(), POLL_INTERVAL_MS);
                } catch {
                    setTimeout(() => void poll(), POLL_INTERVAL_MS);
                }
            };

            void poll();
        },
        [utils],
    );

    // ---------------------------------------------------------------------------
    // Upload a single entry via XHR
    // ---------------------------------------------------------------------------

    const uploadEntry = useCallback(
        (entry: FileEntry) => {
            const formData = new FormData();
            formData.set("title", entry.title.trim() || stripExtension(entry.file.name));
            formData.set("description", entry.description.trim());
            formData.set("privacy", entry.privacy);
            formData.set("channelId", channel.id);
            if (entry.tags.trim()) formData.set("tags", entry.tags.trim());
            formData.set("file", entry.file, entry.file.name);

            const xhr = new XMLHttpRequest();
            xhrMap.current.set(entry.id, xhr);

            setEntries((prev) =>
                prev.map((e) => (e.id === entry.id ? { ...e, status: "uploading", progress: 0 } : e)),
            );

            xhr.upload.addEventListener("progress", (ev) => {
                if (!ev.lengthComputable) return;
                const percent = Math.round((ev.loaded / ev.total) * 100);
                setEntries((prev) =>
                    prev.map((e) => (e.id === entry.id ? { ...e, progress: percent } : e)),
                );
            });

            xhr.addEventListener("load", () => {
                xhrMap.current.delete(entry.id);

                if (xhr.status === 201) {
                    let videoId: string | null = null;
                    try {
                        const body = JSON.parse(xhr.responseText) as { videoId?: string };
                        videoId = body.videoId ?? null;
                    } catch {
                        // fall through
                    }

                    if (!videoId) {
                        setEntries((prev) =>
                            prev.map((e) =>
                                e.id === entry.id
                                    ? { ...e, status: "failed", errorMessage: "Unexpected server response." }
                                    : e,
                            ),
                        );
                        return;
                    }

                    setEntries((prev) =>
                        prev.map((e) =>
                            e.id === entry.id ? { ...e, status: "transcoding", progress: 0, videoId } : e,
                        ),
                    );
                    pollTranscode(entry.id, videoId);
                } else {
                    let errorMessage = "Upload failed.";
                    try {
                        const body = JSON.parse(xhr.responseText) as { error?: string };
                        if (body.error) errorMessage = body.error;
                    } catch {
                        // ignore
                    }
                    setEntries((prev) =>
                        prev.map((e) =>
                            e.id === entry.id ? { ...e, status: "failed", errorMessage } : e,
                        ),
                    );
                }
            });

            xhr.addEventListener("error", () => {
                xhrMap.current.delete(entry.id);
                setEntries((prev) =>
                    prev.map((e) =>
                        e.id === entry.id ? { ...e, status: "failed", errorMessage: "Network error." } : e,
                    ),
                );
            });

            xhr.open("POST", `/api/upload?channelId=${encodeURIComponent(channel.id)}`);
            xhr.withCredentials = true;
            xhr.send(formData);
        },
        [channel.id, pollTranscode],
    );

    // ---------------------------------------------------------------------------
    // Concurrency pool — called after state update via callback
    // ---------------------------------------------------------------------------

    const startPool = useCallback(
        (snapshot: FileEntry[]) => {
            const queued = snapshot.filter((e) => e.status === "queued");
            const active = snapshot.filter((e) => e.status === "uploading" || e.status === "transcoding");

            const slots = MAX_CONCURRENT - active.length;
            const toStart = queued.slice(0, Math.max(0, slots));

            for (const entry of toStart) {
                uploadEntry(entry);
            }
        },
        [uploadEntry],
    );

    // ---------------------------------------------------------------------------
    // File selection
    // ---------------------------------------------------------------------------

    const addFiles = useCallback((files: File[]) => {
        const videoFiles = files.filter((f) => f.type.startsWith("video/") || /\.(mp4|mkv|mov|webm|avi|ts)$/i.test(f.name));
        if (videoFiles.length === 0) return;

        const newEntries: FileEntry[] = videoFiles.map((f) => ({
            id: nextId(),
            file: f,
            title: stripExtension(f.name),
            description: "",
            tags: "",
            privacy: "public",
            status: "queued",
            progress: 0,
            errorMessage: null,
            videoId: null,
        }));

        setEntries((prev) => [...prev, ...newEntries]);
    }, []);

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        addFiles(files);
        // Reset so the same files can be re-selected after removal
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const onDragLeave = () => setIsDragging(false);
    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
    };

    // ---------------------------------------------------------------------------
    // Metadata helpers
    // ---------------------------------------------------------------------------

    const updateField = <K extends keyof FileEntry>(id: string, key: K, value: FileEntry[K]) => {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [key]: value } : e)));
    };

    const removeEntry = (id: string) => {
        xhrMap.current.get(id)?.abort();
        xhrMap.current.delete(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
    };

    const retryEntry = (id: string) => {
        setEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, status: "queued", progress: 0, errorMessage: null } : e)),
        );
    };

    // ---------------------------------------------------------------------------
    // Start uploads
    // ---------------------------------------------------------------------------

    const handleStart = () => {
        setStarted(true);
        setAllDone(false);
        // Kick the pool with the current entries snapshot
        setEntries((prev) => {
            // Use setTimeout so the pool reads fresh state after this render
            setTimeout(() => startPool(prev), 0);
            return prev;
        });
    };

    // Watch for terminal state to update allDone and pump the pool
    const prevEntriesRef = useRef<FileEntry[]>([]);
    if (prevEntriesRef.current !== entries) {
        prevEntriesRef.current = entries;
        if (started && entries.length > 0) {
            const active = entries.filter((e) => e.status === "uploading" || e.status === "transcoding").length;
            const queued = entries.filter((e) => e.status === "queued").length;
            const done = entries.filter((e) => e.status === "ready" || e.status === "failed").length;

            if (active < MAX_CONCURRENT && queued > 0) {
                // Pump next entries — schedule to avoid render-cycle mutation
                setTimeout(() => startPool(entries), 0);
            }

            if (active === 0 && queued === 0 && done === entries.length) {
                setAllDone(true);
            }
        }
    }

    // ---------------------------------------------------------------------------
    // Derived state
    // ---------------------------------------------------------------------------

    const canStart =
        entries.length > 0 &&
        entries.some((e) => e.status === "queued") &&
        !entries.some((e) => e.status === "uploading" || e.status === "transcoding");

    const hasQueued = entries.some((e) => e.status === "queued");

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <div className="space-y-6">
            {/* Drop zone */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
                    isDragging
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="mb-3 h-10 w-10 opacity-60"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                    />
                </svg>
                <p className="text-sm font-medium">Drag and drop videos, or click to browse</p>
                <p className="mt-1 text-xs opacity-60">MP4, MKV, MOV, WebM and more — multiple files supported</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={onFileInputChange}
                    className="hidden"
                />
            </div>

            {/* File table */}
            {entries.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/40">
                                <th className="py-2.5 pl-4 pr-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    File
                                </th>
                                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Metadata
                                </th>
                                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Status
                                </th>
                                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Progress
                                </th>
                                <th className="py-2.5 pl-3 pr-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => {
                                const isActive = entry.status === "uploading" || entry.status === "transcoding";
                                const isFinal = entry.status === "ready" || entry.status === "failed";

                                return (
                                    <tr key={entry.id} className="border-b border-border last:border-0">
                                        {/* File info */}
                                        <td className="py-3 pl-4 pr-3 align-top w-48">
                                            <p className="truncate text-xs font-medium text-foreground max-w-44">
                                                {entry.file.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatFileSize(entry.file.size)}
                                            </p>
                                        </td>

                                        {/* Metadata block */}
                                        <td className="px-3 py-3 align-top min-w-72">
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={entry.title}
                                                    onChange={(e) => updateField(entry.id, "title", e.target.value)}
                                                    disabled={isActive || isFinal}
                                                    placeholder="Title"
                                                    className={cn(
                                                        "flex h-7 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors",
                                                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                                        "disabled:pointer-events-none disabled:opacity-50",
                                                    )}
                                                />
                                                <textarea
                                                    value={entry.description}
                                                    onChange={(e) => updateField(entry.id, "description", e.target.value)}
                                                    disabled={isActive || isFinal}
                                                    rows={2}
                                                    placeholder="Description (optional)"
                                                    className={cn(
                                                        "flex w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm resize-none",
                                                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                                        "disabled:pointer-events-none disabled:opacity-50",
                                                    )}
                                                />
                                                <input
                                                    type="text"
                                                    value={entry.tags}
                                                    onChange={(e) => updateField(entry.id, "tags", e.target.value)}
                                                    disabled={isActive || isFinal}
                                                    placeholder="Tags, e.g. cooking, knife-skills"
                                                    className={cn(
                                                        "flex h-7 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors",
                                                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                                        "disabled:pointer-events-none disabled:opacity-50",
                                                    )}
                                                />
                                                {/* Privacy radios */}
                                                <div className="flex gap-3">
                                                    {(["public", "unlisted", "private"] as PrivacyValue[]).map((v) => (
                                                        <label
                                                            key={v}
                                                            className={cn(
                                                                "flex cursor-pointer items-center gap-1.5 text-xs",
                                                                (isActive || isFinal) && "pointer-events-none opacity-50",
                                                            )}
                                                        >
                                                            <input
                                                                type="radio"
                                                                name={`privacy-${entry.id}`}
                                                                value={v}
                                                                checked={entry.privacy === v}
                                                                onChange={() => updateField(entry.id, "privacy", v)}
                                                                disabled={isActive || isFinal}
                                                                className="accent-primary"
                                                            />
                                                            <span className="capitalize">{v}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-3 py-3 align-top whitespace-nowrap">
                                            <span
                                                className={cn(
                                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                                    statusBadgeClass(entry.status),
                                                )}
                                            >
                                                {statusLabel[entry.status]}
                                            </span>
                                            {entry.errorMessage && (
                                                <p className="mt-1 text-xs text-destructive max-w-36 break-words">
                                                    {entry.errorMessage}
                                                </p>
                                            )}
                                        </td>

                                        {/* Progress bar */}
                                        <td className="px-3 py-3 align-top w-32">
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all duration-300",
                                                        entry.status === "ready"
                                                            ? "bg-green-500"
                                                            : entry.status === "failed"
                                                              ? "bg-destructive"
                                                              : "bg-primary",
                                                    )}
                                                    style={{
                                                        width:
                                                            entry.status === "ready"
                                                                ? "100%"
                                                                : entry.status === "queued"
                                                                  ? "0%"
                                                                  : `${entry.progress}%`,
                                                    }}
                                                />
                                            </div>
                                            {(entry.status === "uploading" || entry.status === "transcoding") && (
                                                <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                                                    {entry.progress}%
                                                </p>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3 pl-3 pr-4 align-top whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {entry.status === "failed" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => retryEntry(entry.id)}
                                                        className="text-xs font-medium text-primary hover:underline"
                                                    >
                                                        Retry
                                                    </button>
                                                )}
                                                {!isActive && entry.status !== "ready" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeEntry(entry.id)}
                                                        className="text-xs text-muted-foreground hover:text-foreground"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Actions */}
            {entries.length > 0 && (
                <div className="flex items-center gap-4">
                    {hasQueued && (
                        <button
                            type="button"
                            onClick={handleStart}
                            disabled={!canStart}
                            className={cn(
                                "inline-flex h-10 items-center justify-center rounded-md bg-primary px-6",
                                "text-sm font-medium text-primary-foreground shadow transition-colors",
                                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            Start uploads
                        </button>
                    )}

                    {!started && (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                            Add more files
                        </button>
                    )}
                </div>
            )}

            {/* Done summary */}
            {allDone && (
                <div className="rounded-xl border border-border bg-card p-5">
                    <p className="text-sm font-medium text-foreground">
                        All uploads processed. {entries.filter((e) => e.status === "ready").length} of{" "}
                        {entries.length} successful.
                    </p>
                    <Link
                        href={`/studio/c/${channel.handle}/videos`}
                        className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
                    >
                        Open Studio videos
                    </Link>
                </div>
            )}
        </div>
    );
};
