import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface VideoCardSkeletonProps {
    className?: string;
}

// Mirrors VideoCard dimensions exactly — used during loading states.
export const VideoCardSkeleton = ({ className }: VideoCardSkeletonProps) => {
    return (
        <div className={cn("block", className)}>
            {/* Thumbnail placeholder */}
            <Skeleton className="aspect-video w-full rounded-xl" />
            {/* Avatar + meta column */}
            <div className="mt-3 flex gap-3">
                <Skeleton className="mt-0.5 h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full rounded" />
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                    <Skeleton className="h-3 w-2/5 rounded" />
                </div>
            </div>
        </div>
    );
};
