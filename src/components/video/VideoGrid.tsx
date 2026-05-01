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

// Responsive grid: 1 col mobile → 2 sm → 3 lg → 4 xl.
// All column variants are statically present so Tailwind can tree-shake correctly.
export const VideoGrid = ({
    videos,
    progress,
    loading = false,
    skeletonCount = 12,
    className,
    emptySlot,
}: VideoGridProps) => {
    const gridClass = cn(
        "grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
    );

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
                {emptySlot ?? (
                    <p className="text-sm text-muted-foreground">No videos yet.</p>
                )}
            </div>
        );
    }

    return (
        <div className={gridClass}>
            {videos.map((video) => (
                <VideoCard
                    key={video.id}
                    video={video}
                    progress={progress?.[video.id]}
                />
            ))}
        </div>
    );
};
