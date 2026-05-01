"use client";

import { useState } from "react";

import { ThumbsDown, ThumbsUp } from "lucide-react";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import { cn, formatCount } from "@/lib/utils";

interface LikeDislikeBarProps {
    videoId: string;
    /** Initial like count from SSR. */
    initialLikes: number;
    /** Initial dislike count from SSR. */
    initialDislikes: number;
    /** Caller's current reaction from SSR. */
    initialReaction?: "like" | "dislike" | null;
    className?: string;
}

export const LikeDislikeBar = ({
    videoId,
    initialLikes,
    initialDislikes,
    initialReaction = null,
    className,
}: LikeDislikeBarProps) => {
    const { data: session } = useSession();
    const userId = session?.user?.id ?? null;

    const [reaction, setReaction] = useState<"like" | "dislike" | null>(initialReaction);
    const [likeDelta, setLikeDelta] = useState(0);
    const [dislikeDelta, setDislikeDelta] = useState(0);

    const toggleMutation = api.like.toggleVideo.useMutation({
        onSuccess: (data, variables) => {
            const prev = reaction;
            const next = data.reactionByMe;
            setReaction(next);

            // Update deltas so the UI reflects the change immediately.
            if (variables.kind === "like") {
                if (prev === "like" && next === null) setLikeDelta((d) => d - 1);
                else if (prev !== "like" && next === "like") {
                    setLikeDelta((d) => d + 1);
                    if (prev === "dislike") setDislikeDelta((d) => d - 1);
                }
            } else {
                if (prev === "dislike" && next === null) setDislikeDelta((d) => d - 1);
                else if (prev !== "dislike" && next === "dislike") {
                    setDislikeDelta((d) => d + 1);
                    if (prev === "like") setLikeDelta((d) => d - 1);
                }
            }
        },
    });

    const displayLikes = initialLikes + likeDelta;
    const displayDislikes = initialDislikes + dislikeDelta;

    const handleLike = () => {
        if (!userId || toggleMutation.isPending) return;
        toggleMutation.mutate({ videoId, kind: "like" });
    };

    const handleDislike = () => {
        if (!userId || toggleMutation.isPending) return;
        toggleMutation.mutate({ videoId, kind: "dislike" });
    };

    return (
        <div
            className={cn(
                "inline-flex items-center divide-x divide-border overflow-hidden rounded-full border border-border bg-secondary",
                className,
            )}
            role="group"
            aria-label="Video reactions"
        >
            {/* Like */}
            <button
                type="button"
                onClick={handleLike}
                disabled={!userId || toggleMutation.isPending}
                aria-label={`Like (${displayLikes})`}
                aria-pressed={reaction === "like"}
                className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
                    "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-50",
                    reaction === "like" && "text-primary",
                )}
            >
                <ThumbsUp className={cn("h-4 w-4", reaction === "like" && "fill-primary")} />
                <span>{formatCount(displayLikes)}</span>
            </button>

            {/* Dislike */}
            <button
                type="button"
                onClick={handleDislike}
                disabled={!userId || toggleMutation.isPending}
                aria-label={`Dislike (${displayDislikes})`}
                aria-pressed={reaction === "dislike"}
                className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
                    "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-50",
                    reaction === "dislike" && "text-primary",
                )}
            >
                <ThumbsDown className={cn("h-4 w-4", reaction === "dislike" && "fill-primary")} />
                <span className="sr-only">{formatCount(displayDislikes)}</span>
            </button>
        </div>
    );
};
