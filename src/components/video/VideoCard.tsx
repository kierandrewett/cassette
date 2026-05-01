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
    /** Short URL-friendly id; preferred over `id` for hrefs. Falls back to `id`
     *  when absent so server callers that have not yet been wired keep working. */
    publicId?: string | null;
    unlistedSlug?: string | null;
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
    const thumbnailSrc = video.thumbnailPath ? `/api/hls/${video.id}/thumb/sprite.jpg` : null;

    const hasDuration = video.durationSec != null && video.durationSec > 0;
    const hasProgress = typeof progress === "number" && progress > 0 && progress < 1;

    // Ref passed to HoverPreview so it can listen for pointer events on the
    // thumbnail wrapper without needing a separate event-wiring layer.
    const thumbRef = useRef<HTMLDivElement>(null);

    const watchId = video.publicId ?? video.id;
    const watchHref = video.unlistedSlug ? `/watch/${watchId}?slug=${video.unlistedSlug}` : `/watch/${watchId}`;

    return (
        <Link
            href={watchHref}
            className={cn(
                // Card itself is layout-only — no padding, no hover bg.
                // The hover treatment lives in an absolute pseudo-card
                // BEHIND the content (see <span aria-hidden> below) so it
                // doesn't push siblings around in the grid. group-hover
                // drives the scale-from-80 fade-in.
                "group relative block",
                className,
            )}
            aria-label={`Watch "${video.title}"`}
        >
            {/* Hover halo — extends slightly past the card bounds so the
                subtle bg "swallows" the card on hover without affecting
                the grid track size. Scales from 80% -> 100% and fades in
                in the same 200ms tween. Sits behind the actual content
                via -z-10. */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-2 -z-10 origin-center scale-90 rounded-xl bg-secondary/50 opacity-0 transition-[transform,opacity] duration-200 ease-out group-hover:scale-100 group-hover:opacity-100"
            />
            {/* Thumbnail */}
            <div ref={thumbRef} className="relative aspect-video overflow-hidden rounded-xl bg-secondary">
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
                    <HoverPreview videoId={video.id} durationSec={video.durationSec} triggerRef={thumbRef} />
                )}

                {/* Duration chip — z-20 keeps it above the preview overlay */}
                {hasDuration && (
                    <span className="absolute bottom-2 right-2 z-20 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white transition-[right] duration-150 group-hover:right-10">
                        {formatDuration(video.durationSec!)}
                    </span>
                )}

                {/* Overflow actions (add to playlist) — client island, visible on hover */}
                <VideoCardActions videoId={video.id} />

                {/* Progress bar — 2 px red bar if partially watched */}
                {hasProgress && (
                    <div className="absolute bottom-0 left-0 right-0 z-20 h-[3px] bg-white/20">
                        <div className="h-full bg-red-500" style={{ width: `${Math.round(progress! * 100)}%` }} />
                    </div>
                )}
            </div>

            {/* Metadata */}
            <div className="mt-2 space-y-0.5">
                {/* Two-line clamp title */}
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{video.title}</h3>
                {/* Channel name only — the redundant "@handle" has been
                    dropped because the channel name already identifies the
                    uploader on the card. */}
                <p className="truncate text-xs text-muted-foreground">{video.channel.name}</p>
                <p className="text-xs text-muted-foreground">
                    {formatCount(video.viewCount)} views
                    {video.publishedAt && (
                        <>
                            {" "}
                            <span aria-hidden="true">&middot;</span> {formatRelativeTime(video.publishedAt)}
                        </>
                    )}
                </p>
            </div>
        </Link>
    );
};
