"use client";

import { useEffect, useRef, useState } from "react";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { CommentReplies } from "./CommentReplies";

interface CommentTreeProps {
    videoId: string;
    /** Whether the current session user is a channel owner/manager for this video. */
    isChannelManager?: boolean;
}

export const CommentTree = ({ videoId, isChannelManager = false }: CommentTreeProps) => {
    const { data: session } = useSession();
    const userId = session?.user?.id ?? null;

    const utils = api.useUtils();

    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = api.comment.list.useInfiniteQuery(
        { videoId, limit: 20 },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
            staleTime: 30_000,
        },
    );

    const createMutation = api.comment.create.useMutation({
        onSuccess: () => {
            void utils.comment.list.invalidate({ videoId });
        },
    });

    const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
    const sectionRef = useRef<HTMLElement | null>(null);

    const toggleReplies = (commentId: string) => {
        setExpandedReplies((prev) => {
            const next = new Set(prev);
            if (next.has(commentId)) {
                next.delete(commentId);
            } else {
                next.add(commentId);
            }
            return next;
        });
    };

    const comments = data?.pages.flatMap((p) => p.items) ?? [];

    // If the URL hash is #comments and there is a pinned comment, scroll the
    // section into view smoothly once the first page of comments loads.
    useEffect(() => {
        if (isLoading || comments.length === 0) return;
        const hasPinned = comments.some((c) => c.isPinned);
        if (!hasPinned) return;
        if (typeof window === "undefined") return;
        if (window.location.hash !== "#comments") return;
        sectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <section ref={sectionRef} aria-label="Comments" className="flex flex-col gap-4">
            {/* Top-level composer */}
            {userId ? (
                <CommentComposer
                    placeholder="Add a comment…"
                    onSubmit={async (body) => {
                        await createMutation.mutateAsync({ videoId, body });
                    }}
                    cancelable
                    isPending={createMutation.isPending}
                />
            ) : (
                <p className="text-sm text-muted-foreground">
                    <a href="/login" className="text-primary underline-offset-4 hover:underline">
                        Sign in
                    </a>{" "}
                    to leave a comment.
                </p>
            )}

            {/* Comment list */}
            {isLoading ? (
                <div className="space-y-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex gap-3 py-1">
                            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="divide-y divide-border">
                    {comments.map((comment) => (
                        <div key={comment.id}>
                            <CommentItem
                                comment={{ ...comment, videoId }}
                                isChannelManager={isChannelManager}
                                onToggleReplies={
                                    comment.replyCount > 0 ? () => toggleReplies(comment.id) : undefined
                                }
                                repliesOpen={expandedReplies.has(comment.id)}
                                onReplySubmitted={() => {
                                    // Auto-expand replies when the user posts one.
                                    setExpandedReplies((prev) => new Set([...prev, comment.id]));
                                    void utils.comment.listReplies.invalidate({ rootId: comment.id });
                                }}
                            />
                            {expandedReplies.has(comment.id) && (
                                <CommentReplies
                                    rootId={comment.id}
                                    videoId={videoId}
                                    isChannelManager={isChannelManager}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Load more */}
            {hasNextPage && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="self-start text-primary"
                >
                    {isFetchingNextPage ? "Loading…" : "Load more comments"}
                </Button>
            )}

            {!isLoading && comments.length === 0 && (
                <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
            )}
        </section>
    );
};
