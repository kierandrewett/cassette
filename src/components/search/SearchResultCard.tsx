import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { formatDuration, formatCount, formatRelativeTime } from "@/lib/utils";

export interface SearchResultVideo {
    id: string;
    title: string;
    description: string;
    thumbnailPath: string | null;
    durationSec: number | null;
    viewCount: number;
    publishedAt: Date | string | null;
    channel: {
        name: string;
        handle: string;
    };
}

interface SearchResultCardProps {
    video: SearchResultVideo;
    /** Watch progress 0-1; shows red bar at bottom of thumbnail. */
    progress?: number;
    className?: string;
}

// Server component — horizontal card variant for the search results page.
// Thumbnail is fixed-width on the left; metadata occupies the remaining space.
export const SearchResultCard = ({ video, progress, className }: SearchResultCardProps) => {
    const thumbnailSrc = video.thumbnailPath ? `/api/hls/${video.id}/thumb/sprite.jpg` : null;
    const hasDuration = video.durationSec != null && video.durationSec > 0;
    const hasProgress = typeof progress === "number" && progress > 0 && progress < 1;

    // Description snippet: show the first ~150 characters.
    const snippet =
        video.description.length > 150 ? `${video.description.slice(0, 150).trimEnd()}…` : video.description;

    return (
        <Link
            href={`/watch/${video.id}`}
            className={cn("group flex gap-4", className)}
            aria-label={`Watch "${video.title}"`}
        >
            {/* Thumbnail — fixed 16:9 at 246px wide on all breakpoints */}
            <div className="relative aspect-video w-[246px] shrink-0 overflow-hidden rounded-xl bg-secondary">
                {thumbnailSrc ? (
                    <Image
                        src={thumbnailSrc}
                        alt=""
                        fill
                        sizes="246px"
                        className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        priority={false}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary">
                        <span className="text-xs text-muted-foreground">No thumbnail</span>
                    </div>
                )}

                {/* Duration chip */}
                {hasDuration && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                        {formatDuration(video.durationSec!)}
                    </span>
                )}

                {/* Watch progress bar */}
                {hasProgress && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
                        <div className="h-full bg-red-500" style={{ width: `${Math.round(progress! * 100)}%` }} />
                    </div>
                )}
            </div>

            {/* Metadata */}
            <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-foreground/90">
                    {video.title}
                </h3>

                <p className="text-xs text-muted-foreground">
                    {formatCount(video.viewCount)} views
                    {video.publishedAt && (
                        <>
                            {" "}
                            <span aria-hidden="true">&middot;</span> {formatRelativeTime(video.publishedAt)}
                        </>
                    )}
                </p>

                <p className="truncate text-xs text-muted-foreground">
                    {video.channel.name} <span aria-hidden="true">&middot;</span>
                    {" @"}
                    {video.channel.handle}
                </p>

                {snippet && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{snippet}</p>
                )}
            </div>
        </Link>
    );
};
