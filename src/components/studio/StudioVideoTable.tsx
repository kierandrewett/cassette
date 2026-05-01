"use client";

import { useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import {
    ArrowDown01Icon,
    ArrowUp01Icon,
    Cancel01Icon,
    Delete02Icon,
    EyeIcon,
    GlobeIcon,
    LockIcon,
    Search01Icon,
    UploadCircle01Icon,
    Video01Icon,
} from "hugeicons-react";
import { toast } from "sonner";

import { StudioEmptyState } from "@/components/studio/StudioEmptyState";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditVideoDialog } from "@/components/studio/EditVideoDialog";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { formatCount, formatRelativeTime } from "@/lib/utils";
import type { Video } from "@/server/db/schema/videos";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PrivacyValue = "public" | "unlisted" | "private";

type StudioVideoTableProps = {
    channelId: string;
    /** Channel handle — needed to render the "Upload" CTA in the filter bar. */
    channelHandle: string;
    videos: Video[];
};

type StatusFilter = "all" | "queued" | "transcoding" | "ready" | "failed";
type PrivacyFilter = "all" | "public" | "unlisted" | "private";
type SortKey = "title" | "status" | "privacy" | "views" | "likes" | "date";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
    queued: "Queued",
    transcoding: "Transcoding",
    ready: "Ready",
    failed: "Failed",
};

const statusClass = (status: string): string => {
    switch (status) {
        case "ready":
            return "text-green-400 bg-green-500/10";
        case "failed":
            return "text-destructive bg-destructive/10";
        case "transcoding":
            return "text-yellow-400 bg-yellow-500/10";
        default:
            return "text-muted-foreground bg-muted";
    }
};

const copyLink = async (video: Pick<Video, "id" | "privacy" | "unlistedSlug">): Promise<void> => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const url =
        video.privacy === "unlisted" && video.unlistedSlug
            ? `${base}/watch/${video.id}?slug=${video.unlistedSlug}`
            : `${base}/watch/${video.id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard.");
};

// ---------------------------------------------------------------------------
// Sort comparator — ordering rules for each sort key. The `dir` param flips
// the result rather than reversing the array so sorting stays stable.
// ---------------------------------------------------------------------------

const sortVideos = (rows: Video[], key: SortKey, dir: SortDir): Video[] => {
    const sign = dir === "asc" ? 1 : -1;
    const cmpString = (a: string, b: string) => a.localeCompare(b);
    const cmpNum = (a: number, b: number) => a - b;
    const cmpDate = (a: Date | null, b: Date | null) => {
        const at = a ? new Date(a).getTime() : 0;
        const bt = b ? new Date(b).getTime() : 0;
        return at - bt;
    };
    return [...rows].sort((a, b) => {
        switch (key) {
            case "title":
                return sign * cmpString(a.title, b.title);
            case "status":
                return sign * cmpString(a.status, b.status);
            case "privacy":
                return sign * cmpString(a.privacy, b.privacy);
            case "views":
                return sign * cmpNum(a.viewCount ?? 0, b.viewCount ?? 0);
            case "likes":
                return sign * cmpNum(a.likeCount ?? 0, b.likeCount ?? 0);
            case "date":
                return sign * cmpDate(a.createdAt, b.createdAt);
        }
    });
};

// ---------------------------------------------------------------------------
// Sortable column header — click toggles direction; clicking a different
// header switches sort target and resets to descending (the YouTube-Studio
// convention so most-recent / most-views land at the top first).
// ---------------------------------------------------------------------------

type SortHeaderProps = {
    label: string;
    sortKey: SortKey;
    activeKey: SortKey;
    activeDir: SortDir;
    onSort: (key: SortKey) => void;
    align?: "left" | "right";
    className?: string;
};

const SortHeader = ({ label, sortKey, activeKey, activeDir, onSort, align = "left", className }: SortHeaderProps) => {
    const isActive = activeKey === sortKey;
    const Icon = isActive && activeDir === "asc" ? ArrowUp01Icon : ArrowDown01Icon;
    return (
        <th className={cn("px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}>
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className={cn(
                    "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                    isActive && "text-foreground",
                    align === "right" && "ml-auto",
                )}
            >
                {label}
                <Icon
                    size={12}
                    strokeWidth={2}
                    className={cn("opacity-0 transition-opacity", isActive && "opacity-100")}
                />
            </button>
        </th>
    );
};

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

type VideoRowProps = {
    video: Video;
    channelId: string;
    selected: boolean;
    onToggleSelect: (videoId: string, shiftKey: boolean) => void;
    onEdit: (video: Video) => void;
    onDeleteRequest: (video: Video) => void;
};

const VideoRow = ({ video, channelId, selected, onToggleSelect, onEdit, onDeleteRequest }: VideoRowProps) => {
    const utils = api.useUtils();

    const setPrivacy = api.video.setPrivacy.useMutation({
        // Optimistic: handled by invalidation on settle rather than manual cache
        // surgery, since table data comes from the server component on first load.
        onSuccess: async () => {
            await utils.video.listForChannel.invalidate({ channelId });
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to update privacy.");
        },
    });

    const publish = api.video.publish.useMutation({
        onSuccess: async () => {
            await utils.video.listForChannel.invalidate({ channelId });
            toast.success("Publishing — transcode queued.");
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to publish video.");
        },
    });

    const handlePrivacyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const privacy = e.target.value as PrivacyValue;
        setPrivacy.mutate({ videoId: video.id, privacy });
    };

    const thumbUrl = video.status === "ready" ? `/api/hls/${video.id}/thumb/sprite.jpg` : null;

    return (
        <tr className={cn("border-b border-border transition-colors", selected ? "bg-primary/5" : "hover:bg-muted/30")}>
            {/* Selection checkbox */}
            <td className="w-10 py-3 pl-4 pr-1">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => onToggleSelect(video.id, (e.nativeEvent as MouseEvent).shiftKey)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${video.title}`}
                    className="h-4 w-4 cursor-pointer accent-primary"
                />
            </td>

            {/* Thumbnail */}
            <td className="w-24 py-3 pl-1 pr-3">
                {thumbUrl ? (
                    <div className="relative aspect-video w-20 overflow-hidden rounded-md bg-muted">
                        <Image src={thumbUrl} alt={video.title} fill sizes="80px" className="object-cover" />
                    </div>
                ) : (
                    <div className="flex aspect-video w-20 items-center justify-center rounded-md bg-muted">
                        <span className="text-xs text-muted-foreground">
                            {video.status === "transcoding" ? "Transcoding…" : "Processing…"}
                        </span>
                    </div>
                )}
            </td>

            {/* Title */}
            <td className="max-w-xs px-3 py-3">
                <p className="truncate text-sm font-medium text-foreground">{video.title}</p>
                {video.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.description}</p>
                )}
            </td>

            {/* Status */}
            <td className="whitespace-nowrap px-3 py-3">
                {video.isDraft ? (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                        {video.publishAt && new Date(video.publishAt).getTime() > Date.now() ? "Scheduled" : "Draft"}
                    </span>
                ) : (
                    <span
                        className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            statusClass(video.status),
                        )}
                    >
                        {STATUS_LABELS[video.status] ?? video.status}
                    </span>
                )}
            </td>

            {/* Privacy */}
            <td className="whitespace-nowrap px-3 py-3">
                <select
                    value={video.privacy}
                    onChange={handlePrivacyChange}
                    disabled={setPrivacy.isPending}
                    className={cn(
                        "rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                </select>
            </td>

            {/* Views */}
            <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">
                {formatCount(video.viewCount ?? 0)}
            </td>

            {/* Likes */}
            <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">
                {formatCount(video.likeCount ?? 0)}
            </td>

            {/* Date */}
            <td className="whitespace-nowrap px-3 py-3 text-sm text-muted-foreground">
                {formatRelativeTime(video.createdAt)}
            </td>

            {/* Actions */}
            <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            aria-label="Actions"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-4 w-4"
                            >
                                <circle cx="10" cy="4" r="1.5" />
                                <circle cx="10" cy="10" r="1.5" />
                                <circle cx="10" cy="16" r="1.5" />
                            </svg>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(video)}>Edit metadata</DropdownMenuItem>
                        {video.isDraft ? (
                            <DropdownMenuItem
                                onClick={() => publish.mutate({ videoId: video.id })}
                                disabled={publish.isPending}
                            >
                                Publish now
                            </DropdownMenuItem>
                        ) : (
                            <DropdownMenuItem onClick={() => void copyLink(video)}>Copy link</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => onDeleteRequest(video)}
                            className="text-destructive focus:text-destructive"
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </td>
        </tr>
    );
};

// ---------------------------------------------------------------------------
// Delete confirm dialog — single OR bulk. `count` distinguishes wording so
// the same dialog drives both flows; the table owns the resolution callback.
// ---------------------------------------------------------------------------

type DeleteDialogProps = {
    open: boolean;
    title: string;
    count: number;
    pending: boolean;
    onConfirm: () => void;
    onClose: () => void;
};

const DeleteDialog = ({ open, title, count, pending, onConfirm, onClose }: DeleteDialogProps) => {
    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{count > 1 ? `Delete ${count} videos?` : "Delete video?"}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{title}</span>{" "}
                    {count > 1
                        ? "and the rest of the selection will be permanently deleted."
                        : "will be permanently deleted."}{" "}
                    This action cannot be undone.
                </p>
                <DialogFooter>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={pending}
                        onClick={onConfirm}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground shadow transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                        {pending ? "Deleting…" : count > 1 ? `Delete ${count} videos` : "Delete"}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

export const StudioVideoTable = ({ channelId, channelHandle, videos }: StudioVideoTableProps) => {
    const utils = api.useUtils();

    const [editVideo, setEditVideo] = useState<Video | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [privacyFilter, setPrivacyFilter] = useState<PrivacyFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("date");
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    // Selection: ids of currently selected rows. We keep the last anchor so
    // shift-click can extend a range (YouTube Studio behaviour). The pivot is
    // refreshed every time the user makes a fresh non-shift click.
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    const [confirmSingleDelete, setConfirmSingleDelete] = useState<Video | null>(null);

    // Single-row mutations are reused for bulk fan-out — keeps the server
    // contract stable and avoids a parallel "bulk" code path. Each mutation
    // gets called per-id with Promise.all in the bulk handlers.
    const setPrivacyMut = api.video.setPrivacy.useMutation();
    const publishMut = api.video.publish.useMutation();
    const deleteMut = api.video.delete.useMutation();

    // Apply search + filters in-memory. The video list is already scoped to
    // the channel and capped server-side (default 50), so client filtering
    // is fine here; if we ever blow past that we'd push these into the trpc
    // query as inputs.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = videos.filter((v) => {
            if (statusFilter !== "all" && v.status !== statusFilter) return false;
            if (privacyFilter !== "all" && v.privacy !== privacyFilter) return false;
            if (q && !v.title.toLowerCase().includes(q)) return false;
            return true;
        });
        return sortVideos(rows, sortKey, sortDir);
    }, [videos, search, statusFilter, privacyFilter, sortKey, sortDir]);

    const onSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const onToggleSelect = (videoId: string, shiftKey: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev);
            // Shift-click: extend selection from the last anchor to this row
            // along the *current* filtered/sorted order — that's what users
            // visually expect, not the raw input order.
            if (shiftKey && anchorId) {
                const ids = filtered.map((v) => v.id);
                const a = ids.indexOf(anchorId);
                const b = ids.indexOf(videoId);
                if (a !== -1 && b !== -1) {
                    const [lo, hi] = a < b ? [a, b] : [b, a];
                    for (let i = lo; i <= hi; i += 1) {
                        const id = ids[i];
                        if (id) next.add(id);
                    }
                    return next;
                }
            }
            if (next.has(videoId)) {
                next.delete(videoId);
            } else {
                next.add(videoId);
            }
            return next;
        });
        if (!shiftKey) setAnchorId(videoId);
    };

    const allFilteredSelected = filtered.length > 0 && filtered.every((v) => selected.has(v.id));
    const someFilteredSelected = filtered.some((v) => selected.has(v.id));

    const onToggleSelectAll = () => {
        setSelected((prev) => {
            if (allFilteredSelected) {
                const next = new Set(prev);
                for (const v of filtered) next.delete(v.id);
                return next;
            }
            const next = new Set(prev);
            for (const v of filtered) next.add(v.id);
            return next;
        });
    };

    const clearSelection = () => {
        setSelected(new Set());
        setAnchorId(null);
    };

    // Resolve current selection back to full video records — bulk handlers
    // need privacy/draft state to skip no-ops (e.g. publish on already-public).
    const selectedVideos = useMemo(() => videos.filter((v) => selected.has(v.id)), [videos, selected]);

    const runBulk = async <T,>(label: string, work: () => Promise<T>) => {
        setBulkBusy(true);
        try {
            await work();
            toast.success(label);
            await utils.video.listForChannel.invalidate({ channelId });
            clearSelection();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Bulk action failed.");
        } finally {
            setBulkBusy(false);
        }
    };

    const onBulkSetPrivacy = (privacy: PrivacyValue) =>
        runBulk(`Updated privacy on ${selectedVideos.length} video${selectedVideos.length === 1 ? "" : "s"}.`, () =>
            Promise.all(
                selectedVideos
                    .filter((v) => v.privacy !== privacy)
                    .map((v) => setPrivacyMut.mutateAsync({ videoId: v.id, privacy })),
            ),
        );

    const onBulkPublish = () => {
        const drafts = selectedVideos.filter((v) => v.isDraft);
        if (drafts.length === 0) {
            toast.info("No drafts in selection.");
            return;
        }
        return runBulk(`Publishing ${drafts.length} draft${drafts.length === 1 ? "" : "s"}.`, () =>
            Promise.all(drafts.map((v) => publishMut.mutateAsync({ videoId: v.id }))),
        );
    };

    const onConfirmBulkDelete = () =>
        runBulk(`Deleted ${selectedVideos.length} video${selectedVideos.length === 1 ? "" : "s"}.`, async () => {
            await Promise.all(selectedVideos.map((v) => deleteMut.mutateAsync({ videoId: v.id })));
            setConfirmBulkDelete(false);
        });

    const onConfirmSingleDelete = async () => {
        if (!confirmSingleDelete) return;
        try {
            await deleteMut.mutateAsync({ videoId: confirmSingleDelete.id });
            toast.success("Video deleted.");
            await utils.video.listForChannel.invalidate({ channelId });
            setConfirmSingleDelete(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete video.");
        }
    };

    // Empty state for a brand-new channel: no videos at all.
    if (videos.length === 0) {
        return (
            <StudioEmptyState
                icon={Video01Icon}
                title="No videos yet"
                description="Upload your first video to start building out your channel."
                cta={{ label: "Upload video", href: `/studio/channel/${channelHandle}/upload` }}
            />
        );
    }

    const hasSelection = selected.size > 0;

    return (
        <>
            {/* Sticky bar — flips between filter mode and selection mode based
                on whether any rows are selected. Both stick at the same offset
                so the table never jumps when toggling. */}
            <div className="sticky top-[7.25rem] z-20 -mx-4 mb-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
                {hasSelection ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            aria-label="Clear selection"
                        >
                            <Cancel01Icon size={16} strokeWidth={1.6} />
                        </button>
                        <span className="text-sm font-medium">{selected.size} selected</span>
                        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

                        {/* Set privacy — split into a dropdown so all three
                            options live behind one button instead of crowding
                            the bar with three pill buttons. */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    disabled={bulkBusy}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                                >
                                    <EyeIcon size={14} strokeWidth={1.6} />
                                    Set privacy
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => onBulkSetPrivacy("public")}>
                                    <GlobeIcon size={14} strokeWidth={1.6} />
                                    Public
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkSetPrivacy("unlisted")}>
                                    <EyeIcon size={14} strokeWidth={1.6} />
                                    Unlisted
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkSetPrivacy("private")}>
                                    <LockIcon size={14} strokeWidth={1.6} />
                                    Private
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <button
                            type="button"
                            onClick={onBulkPublish}
                            disabled={bulkBusy || !selectedVideos.some((v) => v.isDraft)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                            title={selectedVideos.some((v) => v.isDraft) ? undefined : "No drafts in selection"}
                        >
                            <UploadCircle01Icon size={14} strokeWidth={1.6} />
                            Publish
                        </button>

                        <button
                            type="button"
                            onClick={() => setConfirmBulkDelete(true)}
                            disabled={bulkBusy}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:pointer-events-none disabled:opacity-50"
                        >
                            <Delete02Icon size={14} strokeWidth={1.6} />
                            Delete
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Search01Icon
                                size={14}
                                strokeWidth={1.6}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by title"
                                aria-label="Search videos"
                                className="h-9 w-full rounded-full border border-input bg-background pl-9 pr-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        </div>
                        <select
                            value={privacyFilter}
                            onChange={(e) => setPrivacyFilter(e.target.value as PrivacyFilter)}
                            aria-label="Filter by privacy"
                            className="h-9 rounded-full border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <option value="all">All privacy</option>
                            <option value="public">Public</option>
                            <option value="unlisted">Unlisted</option>
                            <option value="private">Private</option>
                        </select>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                            aria-label="Filter by status"
                            className="h-9 rounded-full border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <option value="all">All status</option>
                            <option value="ready">Ready</option>
                            <option value="transcoding">Transcoding</option>
                            <option value="queued">Queued</option>
                            <option value="failed">Failed</option>
                        </select>
                        <Link
                            href={`/studio/channel/${channelHandle}/upload`}
                            className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <UploadCircle01Icon size={14} strokeWidth={1.8} />
                            Upload
                        </Link>
                    </div>
                )}
            </div>

            {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                        No videos match the current filters.{" "}
                        <button
                            type="button"
                            onClick={() => {
                                setSearch("");
                                setStatusFilter("all");
                                setPrivacyFilter("all");
                            }}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                            Clear filters
                        </button>
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-border bg-muted/40">
                                <th className="w-10 py-3 pl-4 pr-1">
                                    <input
                                        type="checkbox"
                                        checked={allFilteredSelected}
                                        ref={(el) => {
                                            // Tri-state: visually distinguish a partial selection
                                            // (some-but-not-all rows in the current filter) from
                                            // empty/full so users see at a glance what clicking
                                            // the header will do.
                                            if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected;
                                        }}
                                        onChange={onToggleSelectAll}
                                        aria-label={allFilteredSelected ? "Clear selection" : "Select all"}
                                        className="h-4 w-4 cursor-pointer accent-primary"
                                    />
                                </th>
                                <th className="py-3 pl-1 pr-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    <span className="sr-only">Thumbnail</span>
                                </th>
                                <SortHeader
                                    label="Title"
                                    sortKey="title"
                                    activeKey={sortKey}
                                    activeDir={sortDir}
                                    onSort={onSort}
                                />
                                <SortHeader
                                    label="Status"
                                    sortKey="status"
                                    activeKey={sortKey}
                                    activeDir={sortDir}
                                    onSort={onSort}
                                />
                                <SortHeader
                                    label="Privacy"
                                    sortKey="privacy"
                                    activeKey={sortKey}
                                    activeDir={sortDir}
                                    onSort={onSort}
                                />
                                <SortHeader
                                    label="Views"
                                    sortKey="views"
                                    activeKey={sortKey}
                                    activeDir={sortDir}
                                    onSort={onSort}
                                />
                                <SortHeader
                                    label="Likes"
                                    sortKey="likes"
                                    activeKey={sortKey}
                                    activeDir={sortDir}
                                    onSort={onSort}
                                />
                                <SortHeader
                                    label="Date"
                                    sortKey="date"
                                    activeKey={sortKey}
                                    activeDir={sortDir}
                                    onSort={onSort}
                                />
                                <th className="py-3 pl-3 pr-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((video) => (
                                <VideoRow
                                    key={video.id}
                                    video={video}
                                    channelId={channelId}
                                    selected={selected.has(video.id)}
                                    onToggleSelect={onToggleSelect}
                                    onEdit={(v) => setEditVideo(v)}
                                    onDeleteRequest={(v) => setConfirmSingleDelete(v)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Footer summary — counts visible / total + selection. Mirrors
                the YouTube Studio footer so users always know the scope of
                what they're acting on. */}
            <div className="mt-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>
                    {filtered.length} of {videos.length} video{videos.length === 1 ? "" : "s"}
                    {selected.size > 0 && ` · ${selected.size} selected`}
                </span>
            </div>

            {editVideo && (
                <EditVideoDialog
                    open={!!editVideo}
                    onOpenChange={(open) => {
                        if (!open) setEditVideo(null);
                    }}
                    channelId={channelId}
                    video={{
                        id: editVideo.id,
                        title: editVideo.title,
                        description: editVideo.description,
                        tags: editVideo.tags,
                        isDraft: editVideo.isDraft,
                        publishAt: editVideo.publishAt,
                    }}
                />
            )}

            <DeleteDialog
                open={!!confirmSingleDelete}
                title={confirmSingleDelete?.title ?? ""}
                count={1}
                pending={deleteMut.isPending}
                onConfirm={() => void onConfirmSingleDelete()}
                onClose={() => setConfirmSingleDelete(null)}
            />

            <DeleteDialog
                open={confirmBulkDelete}
                title={selectedVideos[0]?.title ?? ""}
                count={selectedVideos.length}
                pending={bulkBusy}
                onConfirm={() => void onConfirmBulkDelete()}
                onClose={() => setConfirmBulkDelete(false)}
            />
        </>
    );
};
