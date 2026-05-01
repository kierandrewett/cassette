"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { formatDuration, formatCount, formatRelativeTime } from "@/lib/utils";
import { VideoCardActions } from "./VideoCardActions";
import { HoverPreview } from "./HoverPreview";

export interface VideoCardVideo {
    id: string;
    title: string;
    thumbnailPath: string | null;
    durationSec: number | null;
    viewCount: number;
    publishedAt: Date | string | null;
    channel: {
        name: string;
        handle: string;
    };
}

interface VideoCardProps {
    video: VideoCardVideo;
    /** Watch progress 0-1, shows a red bar at the bottom of the thumbnail. */
    progress?: number;
    className?: string;
}

export const VideoCard = ({ video, progress, className }: VideoCardProps) => {
    const thumbnailSrc = video.thumbnailPath
        ? `/api/hls/${video.id}/thumb/sprite.jpg`
        : null;

    const hasDuration = video.durationSec != null && video.durationSec > 0;
    const hasProgress = typeof progress === "number" && progress > 0 && progress < 1;

    // Ref passed to HoverPreview so it can listen for pointer events on the
    // thumbnail wrapper without needing a separate event-wiring layer.
    const thumbRef = useRef<HTMLDivElement>(null);

    return (
        <Link
            href={`/watch/${video.id}`}
            className={cn("group block", className)}
            aria-label={`Watch "${video.title}"`}
        >
            {/* Thumbnail */}
            <div
                ref={thumbRef}
                className="relative overflow-hidden rounded-xl bg-secondary aspect-video"
            >
                {thumbnailSrc ? (
                    <Image
                        src={thumbnailSrc}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        priority={false}
                    />
                ) : (
                    // Placeholder when no thumbnail exists yet.
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary">
                        <span className="text-xs text-muted-foreground">No thumbnail</span>
                    </div>
                )}

                {/* Hover preview — sits above the static thumbnail but below the duration chip (z-10 vs z-20) */}
                {thumbnailSrc && (
                    <HoverPreview
                        videoId={video.id}
                        durationSec={video.durationSec}
                        triggerRef={thumbRef}
                    />
                )}

                {/* Duration chip — z-20 keeps it above the preview overlay */}
                {hasDuration && (
                    <span className="absolute bottom-2 right-2 z-20 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums group-hover:right-10 transition-[right] duration-150">
                        {formatDuration(video.durationSec!)}
                    </span>
                )}

                {/* Overflow actions (add to playlist) — client island, visible on hover */}
                <VideoCardActions videoId={video.id} />

                {/* Progress bar — 2 px red bar if partially watched */}
                {hasProgress && (
                    <div className="absolute bottom-0 left-0 right-0 z-20 h-[3px] bg-white/20">
                        <div
                            className="h-full bg-red-500"
                            style={{ width: `${Math.round(progress! * 100)}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Metadata */}
            <div className="mt-2 space-y-0.5 group-hover:shadow-md transition-shadow duration-200">
                {/* Two-line clamp title */}
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                    {video.title}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                    {video.channel.name}
                    {" "}
                    <span aria-hidden="true">&middot;</span>
                    {" @"}{video.channel.handle}
                </p>
                <p className="text-xs text-muted-foreground">
                    {formatCount(video.viewCount)} views
                    {video.publishedAt && (
                        <>
                            {" "}
                            <span aria-hidden="true">&middot;</span>
                            {" "}
                            {formatRelativeTime(video.publishedAt)}
                        </>
                    )}
                </p>
            </div>
        </Link>
    );
};
