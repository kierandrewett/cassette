import Image from "next/image";
import Link from "next/link";

import { formatDuration, formatRelativeTime } from "@/lib/utils";

interface HistoryItem {
    historyId: string;
    watchedAt: Date;
    video: {
        id: string;
        title: string;
        thumbnailPath: string | null;
        durationSec: number | null;
        viewCount: number;
        publishedAt: Date | null;
    };
    channel: {
        name: string;
        handle: string;
    };
}

interface HistoryGroupProps {
    label: string;
    items: HistoryItem[];
    /** Called when the parent wants to remove a single item (client-side trigger). */
    onRemove?: (videoId: string) => void;
}

// A per-day group of watch history items.
export const HistoryGroup = ({ label, items, onRemove }: HistoryGroupProps) => {
    return (
        <section className="space-y-1">
            <h2 className="sticky top-14 z-10 bg-background/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur md:px-6">
                {label}
            </h2>

            <ul className="space-y-1 px-4 md:px-6">
                {items.map((item) => {
                    const thumbSrc = item.video.thumbnailPath
                        ? `/api/hls/${item.video.id}/thumb/sprite.jpg`
                        : null;

                    return (
                        <li
                            key={item.historyId}
                            className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/50"
                        >
                            {/* Thumbnail */}
                            <Link
                                href={`/watch/${item.video.id}`}
                                className="relative flex-shrink-0 overflow-hidden rounded-md bg-secondary"
                                style={{ width: 140, height: 79 }}
                            >
                                {thumbSrc ? (
                                    <Image
                                        src={thumbSrc}
                                        alt=""
                                        fill
                                        className="object-cover"
                                        sizes="140px"
                                    />
                                ) : (
                                    <div className="h-full w-full bg-secondary" />
                                )}
                                {item.video.durationSec != null && item.video.durationSec > 0 && (
                                    <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white tabular-nums">
                                        {formatDuration(item.video.durationSec)}
                                    </span>
                                )}
                            </Link>

                            {/* Meta */}
                            <div className="min-w-0 flex-1">
                                <Link
                                    href={`/watch/${item.video.id}`}
                                    className="line-clamp-2 text-sm font-medium text-foreground hover:underline"
                                >
                                    {item.video.title}
                                </Link>
                                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                    <Link
                                        href={`/c/${item.channel.handle}`}
                                        className="hover:underline"
                                    >
                                        {item.channel.name}
                                    </Link>
                                </p>
                                {item.video.publishedAt && (
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {formatRelativeTime(item.video.publishedAt)}
                                    </p>
                                )}
                            </div>

                            {/* Remove button */}
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={() => onRemove(item.video.id)}
                                    className="mt-0.5 flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                                    title="Remove from history"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                    >
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                    <span className="sr-only">Remove</span>
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
