"use client";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { CommentItem } from "./CommentItem";

interface CommentRepliesProps {
    rootId: string;
    videoId: string;
    isChannelManager?: boolean;
}

export const CommentReplies = ({ rootId, videoId, isChannelManager = false }: CommentRepliesProps) => {
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
        api.comment.listReplies.useInfiniteQuery(
            { rootId, limit: 50 },
            {
                getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
                staleTime: 30_000,
            },
        );

    if (isLoading) {
        return (
            <div className="ml-12 mt-2 space-y-3">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                ))}
            </div>
        );
    }

    const replies = data?.pages.flatMap((p) => p.items) ?? [];

    if (replies.length === 0) {
        return null;
    }

    return (
        <div className="ml-12 border-l border-border pl-4">
            {replies.map((reply) => (
                <CommentItem
                    key={reply.id}
                    comment={{ ...reply, replyCount: 0, videoId }}
                    isChannelManager={isChannelManager}
                />
            ))}

            {hasNextPage && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-8 text-xs text-primary"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                >
                    {isFetchingNextPage ? "Loading…" : "Show more replies"}
                </Button>
            )}
        </div>
    );
};
