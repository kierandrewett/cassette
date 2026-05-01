import Link from "next/link";

import { formatDuration, formatCount, formatRelativeTime } from "@/lib/utils";

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
 * Server component. Renders a vertical list of compact video cards for the
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
            <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-1">Up Next</h2>
            {videos.map((v, i) => (
                <SidebarCard key={v.id} video={v} isNext={i === 0} />
            ))}
        </div>
    );
};

const SidebarCard = ({ video, isNext }: { video: SidebarVideo; isNext: boolean }) => {
    const hasDuration = video.durationSec != null && video.durationSec > 0;

    return (
        <Link
            href={`/watch/${video.id}`}
            className="group flex gap-2 rounded-xl hover:bg-secondary/60 transition-colors p-1.5"
            aria-label={`Watch "${video.title}"`}
        >
            {/* Thumbnail */}
            <div className="relative w-40 flex-shrink-0 overflow-hidden rounded-lg aspect-video bg-secondary">
                {video.thumbnailPath ? (
                    <img
                        src={`/api/hls/${video.id}/thumb/sprite.jpg`}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">No thumbnail</span>
                    </div>
                )}
                {hasDuration && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium text-white tabular-nums">
                        {formatDuration(video.durationSec!)}
                    </span>
                )}
            </div>

            {/* Meta */}
            <div className="flex min-w-0 flex-col justify-center gap-0.5">
                {isNext && (
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Up Next
                    </span>
                )}
                <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground group-hover:text-foreground/90">
                    {video.title}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{video.channel.name}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
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
