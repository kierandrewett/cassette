"use client";

import { useState } from "react";
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
 * Pill button that saves a video to Watch Later with optimistic feedback.
 * Flips to a "Saved" state immediately on click and reconciles on settle.
 * Anonymous viewers are redirected to login.
 */
export const AddToWatchLaterChip = ({ videoId, className }: AddToWatchLaterChipProps) => {
    const { data: session } = useSession();
    const [saved, setSaved] = useState(false);

    const addMutation = api.playlist.watchLater.add.useMutation({
        onMutate: () => {
            setSaved(true);
        },
        onError: () => {
            setSaved(false);
            toast.error("Failed to save to Watch Later");
        },
        onSuccess: () => {
            toast.success("Saved to Watch Later");
        },
    });

    if (!session?.user) {
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

    return (
        <button
            type="button"
            onClick={() => {
                if (!saved && !addMutation.isPending) {
                    addMutation.mutate({ videoId });
                }
            }}
            disabled={saved || addMutation.isPending}
            aria-label={saved ? "Saved to Watch Later" : "Save to Watch Later"}
            aria-pressed={saved}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                saved
                    ? "bg-secondary text-foreground cursor-default"
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
