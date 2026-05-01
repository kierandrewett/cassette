import { cn } from "@/lib/utils";
import { VideoCard, type VideoCardVideo } from "./VideoCard";
import { VideoCardSkeleton } from "./VideoCardSkeleton";

interface VideoGridProps {
    videos?: VideoCardVideo[];
    progress?: Record<string, number>;
    /** When true, renders skeleton cards instead of real content. */
    loading?: boolean;
    /** Number of skeleton cards to render when loading. */
    skeletonCount?: number;
    className?: string;
    /** Slot rendered when videos is empty (and not loading). */
    emptySlot?: React.ReactNode;
}

// Auto-fill responsive grid: every column is at least 240px wide and fills
// the available track. The grid grows from 1 column at narrow widths to as
// many as the viewport allows on ultra-wide monitors, without leaving a
// gutter at any size. Replaces the fixed `xl:grid-cols-N` ladder, which
// stopped at 8 cols at 3440px and looked thin on monitors that fell
// between breakpoints.
export const VideoGrid = ({
    videos,
    progress,
    loading = false,
    skeletonCount = 12,
    className,
    emptySlot,
}: VideoGridProps) => {
    // auto-fit (not auto-fill) so empty trailing tracks collapse and the
    // remaining cards stretch to fill the row. 220px floor lets one more
    // column kick in on ~2000px monitors where 240 was just over budget.
    const gridClass = cn("grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-4 gap-y-6", className);

    if (loading) {
        return (
            <div className={gridClass} aria-busy="true" aria-label="Loading videos">
                {Array.from({ length: skeletonCount }, (_, i) => (
                    <VideoCardSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (!videos || videos.length === 0) {
        return (
            <div className="py-20 text-center">
                {emptySlot ?? <p className="text-sm text-muted-foreground">No videos yet.</p>}
            </div>
        );
    }

    return (
        <div className={gridClass}>
            {videos.map((video) => (
                <VideoCard key={video.id} video={video} progress={progress?.[video.id]} />
            ))}
        </div>
    );
};
