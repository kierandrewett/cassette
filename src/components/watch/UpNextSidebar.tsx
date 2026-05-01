"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";

import { formatDuration, formatCount, formatRelativeTime } from "@/lib/utils";
import { HoverPreview } from "@/components/video/HoverPreview";

interface SidebarVideo {
    id: string;
    title: string;
    thumbnailPath: string | null;
    durationSec: number | null;
    viewCount: number;
    publishedAt: Date | string | null;
    channel: { name: string; handle: string };
}

interface UpNextSidebarProps {
    videos: SidebarVideo[];
}

/**
 * Client component. Renders a vertical list of compact video cards for the
 * Up Next / autoplay sidebar. The queue integration (M7) will prepend queue
 * items before this fallback list.
 *
 * TODO (M7): Prepend queue items from playlist.queue.list() once the queue
 * system lands.
 */
export const UpNextSidebar = ({ videos }: UpNextSidebarProps) => {
    if (videos.length === 0) {
        return (
            <div className="rounded-xl border border-border/50 p-4 text-sm text-muted-foreground">
                No more videos from this channel.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-foreground/80">Up Next</h2>
            {videos.map((v, i) => (
                <SidebarCard key={v.id} video={v} isNext={i === 0} />
            ))}
        </div>
    );
};

const SidebarCard = ({ video, isNext }: { video: SidebarVideo; isNext: boolean }) => {
    const hasDuration = video.durationSec != null && video.durationSec > 0;
    const thumbRef = useRef<HTMLDivElement>(null);

    return (
        <Link
            href={`/watch/${video.id}`}
            className="group flex gap-2 rounded-xl p-1.5 transition-colors hover:bg-secondary/60"
            aria-label={`Watch "${video.title}"`}
        >
            {/* Thumbnail */}
            <div
                ref={thumbRef}
                className="relative aspect-video w-40 flex-shrink-0 overflow-hidden rounded-lg bg-secondary"
            >
                {video.thumbnailPath ? (
                    <Image
                        src={`/api/hls/${video.id}/thumb/sprite.jpg`}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">No thumbnail</span>
                    </div>
                )}

                {/* Hover preview — sits above the static thumbnail but below the duration chip */}
                {video.thumbnailPath && (
                    <HoverPreview videoId={video.id} durationSec={video.durationSec} triggerRef={thumbRef} />
                )}

                {hasDuration && (
                    <span className="absolute bottom-1.5 right-1.5 z-20 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
                        {formatDuration(video.durationSec!)}
                    </span>
                )}
            </div>

            {/* Meta */}
            <div className="flex min-w-0 flex-col justify-center gap-0.5">
                {isNext && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Up Next
                    </span>
                )}
                <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground group-hover:text-foreground/90">
                    {video.title}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{video.channel.name}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
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
