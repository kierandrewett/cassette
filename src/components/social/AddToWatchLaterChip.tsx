"use client";

import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface AddToWatchLaterChipProps {
    videoId: string;
    className?: string;
}

/**
 * Pill button that toggles a video into / out of Watch Later. Optimistically
 * flips on click, reconciles with the server on settle, and seeds initial
 * state from `playlist.watchLater.has` so the button reflects reality on
 * mount instead of always starting at "unsaved".
 *
 * Anonymous viewers get a sign-in link instead of a real toggle.
 */
export const AddToWatchLaterChip = ({ videoId, className }: AddToWatchLaterChipProps) => {
    const { data: session } = useSession();
    const isSignedIn = !!session?.user;
    const utils = api.useUtils();

    const hasQuery = api.playlist.watchLater.has.useQuery(
        { videoId },
        { enabled: isSignedIn, staleTime: 30_000 },
    );
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (hasQuery.data) setSaved(hasQuery.data.saved);
    }, [hasQuery.data]);

    const invalidateAfter = () => {
        void utils.playlist.watchLater.has.invalidate({ videoId });
        void utils.playlist.watchLater.list.invalidate();
    };

    const addMutation = api.playlist.watchLater.add.useMutation({
        onMutate: () => setSaved(true),
        onError: () => {
            setSaved(false);
            toast.error("Failed to save to Watch Later");
        },
        onSuccess: () => toast.success("Saved to Watch Later"),
        onSettled: invalidateAfter,
    });

    const removeMutation = api.playlist.watchLater.remove.useMutation({
        onMutate: () => setSaved(false),
        onError: () => {
            setSaved(true);
            toast.error("Failed to remove from Watch Later");
        },
        onSuccess: () => toast.success("Removed from Watch Later"),
        onSettled: invalidateAfter,
    });

    if (!isSignedIn) {
        return (
            <a
                href="/login"
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    "bg-secondary/60 text-foreground/80 hover:bg-secondary/80 hover:text-foreground",
                    className,
                )}
                aria-label="Sign in to save to Watch Later"
            >
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span>Watch Later</span>
            </a>
        );
    }

    const busy = addMutation.isPending || removeMutation.isPending;

    return (
        <button
            type="button"
            onClick={() => {
                if (busy) return;
                if (saved) removeMutation.mutate({ videoId });
                else addMutation.mutate({ videoId });
            }}
            disabled={busy}
            aria-label={saved ? "Remove from Watch Later" : "Save to Watch Later"}
            aria-pressed={saved}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                saved
                    ? "bg-secondary text-foreground hover:bg-secondary/80"
                    : "bg-secondary/60 text-foreground/80 hover:bg-secondary/80 hover:text-foreground",
                className,
            )}
        >
            {saved ? (
                <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
            ) : (
                <Clock className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{saved ? "Saved" : "Watch Later"}</span>
        </button>
    );
};
