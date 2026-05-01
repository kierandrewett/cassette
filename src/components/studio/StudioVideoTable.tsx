"use client";

import { useState } from "react";

import Image from "next/image";
import { toast } from "sonner";

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
    videos: Video[];
};

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

    const handlePrivacyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const privacy = e.target.value as PrivacyValue;
        setPrivacy.mutate({ videoId: video.id, privacy });
    };

    const thumbUrl =
        video.status === "ready" ? `/api/hls/${video.id}/thumb/sprite.jpg` : null;

    return (
        <tr className="border-b border-border transition-colors hover:bg-muted/30">
            {/* Thumbnail */}
            <td className="py-3 pl-4 pr-3 w-24">
                {thumbUrl ? (
                    <div className="relative aspect-video w-20 overflow-hidden rounded-md bg-muted">
                        <Image
                            src={thumbUrl}
                            alt={video.title}
                            fill
                            sizes="80px"
                            className="object-cover"
                        />
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
            <td className="px-3 py-3 max-w-xs">
                <p className="truncate text-sm font-medium text-foreground">{video.title}</p>
                {video.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.description}</p>
                )}
            </td>

            {/* Status */}
            <td className="px-3 py-3 whitespace-nowrap">
                <span
                    className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        statusClass(video.status),
                    )}
                >
                    {STATUS_LABELS[video.status] ?? video.status}
                </span>
            </td>

            {/* Privacy */}
            <td className="px-3 py-3 whitespace-nowrap">
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
            <td className="px-3 py-3 whitespace-nowrap text-sm text-muted-foreground">
                {formatCount(video.viewCount ?? 0)}
            </td>

            {/* Likes */}
            <td className="px-3 py-3 whitespace-nowrap text-sm text-muted-foreground">
                {formatCount(video.likeCount ?? 0)}
            </td>

            {/* Date */}
            <td className="px-3 py-3 whitespace-nowrap text-sm text-muted-foreground">
                {formatRelativeTime(video.createdAt)}
            </td>

            {/* Actions */}
            <td className="py-3 pl-3 pr-4 whitespace-nowrap text-right">
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
                        <DropdownMenuItem onClick={() => onEdit(video)}>
                            Edit metadata
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyLink(video)}>
                            Copy link
                        </DropdownMenuItem>
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
        <Dialog open={!!video} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete video?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{video?.title}</span> will be permanently
                    deleted. This action cannot be undone.
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
                        onClick={() => { if (video) deleteVideo.mutate({ videoId: video.id }); }}
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

export const StudioVideoTable = ({ channelId, videos }: StudioVideoTableProps) => {
    const [editVideo, setEditVideo] = useState<Video | null>(null);
    const [deleteVideo, setDeleteVideo] = useState<Video | null>(null);

    if (videos.length === 0) {
        return (
            <div className="py-16 text-center text-muted-foreground">
                <p className="text-sm">No videos yet. Upload your first video to get started.</p>
            </div>
        );
    }

    return (
        <>
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
                        {videos.map((video) => (
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

            {editVideo && (
                <EditVideoDialog
                    open={!!editVideo}
                    onOpenChange={(open) => { if (!open) setEditVideo(null); }}
                    channelId={channelId}
                    video={{
                        id: editVideo.id,
                        title: editVideo.title,
                        description: editVideo.description,
                    }}
                />
            )}

            <DeleteDialog
                video={deleteVideo}
                channelId={channelId}
                onClose={() => setDeleteVideo(null)}
            />
        </>
    );
};
