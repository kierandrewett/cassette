"use client";

import { useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { Search01Icon, UploadCircle01Icon, Video01Icon } from "hugeicons-react";
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
// Row component
// ---------------------------------------------------------------------------

type VideoRowProps = {
    video: Video;
    channelId: string;
    onEdit: (video: Video) => void;
    onDeleteRequest: (video: Video) => void;
};

const VideoRow = ({ video, channelId, onEdit, onDeleteRequest }: VideoRowProps) => {
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
        <tr className="border-b border-border transition-colors hover:bg-muted/30">
            {/* Thumbnail */}
            <td className="w-24 py-3 pl-4 pr-3">
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
// Delete confirm dialog
// ---------------------------------------------------------------------------

type DeleteDialogProps = {
    video: Video | null;
    channelId: string;
    onClose: () => void;
};

const DeleteDialog = ({ video, channelId, onClose }: DeleteDialogProps) => {
    const utils = api.useUtils();

    const deleteVideo = api.video.delete.useMutation({
        onSuccess: async () => {
            await utils.video.listForChannel.invalidate({ channelId });
            onClose();
            toast.success("Video deleted.");
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to delete video.");
        },
    });

    return (
        <Dialog
            open={!!video}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete video?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{video?.title}</span> will be permanently deleted.
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
                        disabled={deleteVideo.isPending}
                        onClick={() => {
                            if (video) deleteVideo.mutate({ videoId: video.id });
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground shadow transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    >
                        {deleteVideo.isPending ? "Deleting…" : "Delete"}
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
    const [editVideo, setEditVideo] = useState<Video | null>(null);
    const [deleteVideo, setDeleteVideo] = useState<Video | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [privacyFilter, setPrivacyFilter] = useState<PrivacyFilter>("all");

    // Apply search + filters in-memory. The video list is already scoped to
    // the channel and capped server-side (default 50), so client filtering
    // is fine here; if we ever blow past that we'd push these into the trpc
    // query as inputs.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return videos.filter((v) => {
            if (statusFilter !== "all" && v.status !== statusFilter) return false;
            if (privacyFilter !== "all" && v.privacy !== privacyFilter) return false;
            if (q && !v.title.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [videos, search, statusFilter, privacyFilter]);

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

    return (
        <>
            {/* Sticky filter bar — privacy + status filters, search, and the
                primary Upload CTA pinned to the right. Sticks just under the
                StudioSubNav so the filters never scroll out of reach. */}
            <div className="sticky top-[7.25rem] z-20 -mx-4 mb-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
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
                                <th className="py-3 pl-4 pr-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Thumbnail
                                </th>
                                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Title
                                </th>
                                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Status
                                </th>
                                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Privacy
                                </th>
                                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Views
                                </th>
                                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Likes
                                </th>
                                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Date
                                </th>
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
                                    onEdit={(v) => setEditVideo(v)}
                                    onDeleteRequest={(v) => setDeleteVideo(v)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

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

            <DeleteDialog video={deleteVideo} channelId={channelId} onClose={() => setDeleteVideo(null)} />
        </>
    );
};
