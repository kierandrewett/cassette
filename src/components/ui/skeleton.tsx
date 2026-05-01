import { cn } from "@/lib/utils";

// Skeleton: pulse animation on dark muted surface.
const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
    return <div className={cn("animate-pulse rounded-lg bg-secondary/60", className)} {...props} />;
};

export { Skeleton };
