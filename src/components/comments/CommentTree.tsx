"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";

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

// How long the "(new)" badge sticks around on a freshly-arrived comment.
const FRESH_BADGE_MS = 5_000;

// Wire-shape of an `event: comment` SSE payload from /api/sse/comments/[videoId].
// Mirrors the subset of the comment.list payload that CommentItem actually
// reads. Replies (parentId !== null) are ignored; CommentReplies refreshes
// itself when the user reposts.
interface SseCommentPayload {
    id: string;
    body: string;
    createdAt: string;
    parentId: string | null;
    rootId: string | null;
    author: {
        name: string | null;
        gravatarHash: string | null;
        channelHandle: string | null;
        image: string | null;
    };
}

export const CommentTree = ({ videoId, isChannelManager = false }: CommentTreeProps) => {
    const { data: session } = useSession();
    const userId = session?.user?.id ?? null;
    const me = session?.user ? { name: session.user.name, image: session.user.image, email: session.user.email } : null;
    const t = useTranslations("comments");
    const tActions = useTranslations("actions");

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

    // Comments that arrived over SSE *after* the initial fetch. These render
    // above the paginated list and carry a transient "(new)" badge that
    // fades out after FRESH_BADGE_MS. They merge into the canonical list on
    // the next infinite-query refetch.
    const [liveComments, setLiveComments] = useState<SseCommentPayload[]>([]);
    const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

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

    const fetchedComments = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

    // Merge live comments above the fetched list, deduping any ids that have
    // since shown up in the paginated query (e.g. after a manual refetch).
    const fetchedIds = useMemo(() => new Set(fetchedComments.map((c) => c.id)), [fetchedComments]);
    const visibleLive = useMemo(() => liveComments.filter((c) => !fetchedIds.has(c.id)), [liveComments, fetchedIds]);

    // SSE subscription. The endpoint pushes one `event: comment` per new row;
    // we drop dups (the user's own just-posted comment shows up via the
    // optimistic refetch) and prepend the rest.
    const handleIncoming = useCallback(
        (payload: SseCommentPayload) => {
            // Only top-level comments belong in this list. Replies live under
            // their root and are refetched by CommentReplies' own query.
            if (payload.parentId) return;
            setLiveComments((prev) => {
                if (prev.some((c) => c.id === payload.id)) return prev;
                if (fetchedIds.has(payload.id)) return prev;
                return [payload, ...prev].slice(0, 50);
            });
            setFreshIds((prev) => {
                const next = new Set(prev);
                next.add(payload.id);
                return next;
            });
            // Drop the "(new)" badge after a beat so it doesn't sit there forever.
            const id = payload.id;
            window.setTimeout(() => {
                setFreshIds((prev) => {
                    if (!prev.has(id)) return prev;
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }, FRESH_BADGE_MS);
        },
        [fetchedIds],
    );

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.EventSource === "undefined") return;
        const es = new EventSource(`/api/sse/comments/${videoId}`);
        es.addEventListener("comment", (ev) => {
            try {
                const payload = JSON.parse((ev as MessageEvent<string>).data) as SseCommentPayload;
                handleIncoming(payload);
            } catch {
                // ignore malformed payloads
            }
        });
        return () => es.close();
    }, [videoId, handleIncoming]);

    const comments = useMemo(() => {
        if (visibleLive.length === 0) return fetchedComments;
        // SSE rows lack the full reaction/reply metadata, so we shape them
        // into the same row contract CommentItem expects. They get a
        // `replyCount: 0` and `reactionByMe: null` baseline; once the
        // infinite query refetches (on `comment.list.invalidate`) the real
        // values land.
        const stubs = visibleLive.map((c) => ({
            id: c.id,
            videoId,
            parentId: c.parentId,
            rootId: c.rootId,
            body: c.body,
            isPinned: false,
            isHearted: false,
            editedAt: null,
            likeCount: 0,
            dislikeCount: 0,
            createdAt: new Date(c.createdAt),
            replyCount: 0,
            reactionByMe: null as "like" | "dislike" | null,
            author: {
                id: null,
                name: c.author.name,
                image: c.author.image,
                gravatarHash: c.author.gravatarHash,
                channelHandle: c.author.channelHandle,
            },
        }));
        return [...stubs, ...fetchedComments];
    }, [visibleLive, fetchedComments, videoId]);

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
                    placeholder={t("addComment")}
                    onSubmit={async (body) => {
                        await createMutation.mutateAsync({ videoId, body });
                    }}
                    cancelable
                    isPending={createMutation.isPending}
                    me={me}
                />
            ) : (
                <p className="text-sm text-muted-foreground">
                    <a href="/login" className="text-primary underline-offset-4 hover:underline">
                        {t("signInPrompt")}
                    </a>{" "}
                    {t("signInToComment")}
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
                    {comments.map((comment) => {
                        const isFresh = freshIds.has(comment.id);
                        return (
                            <div key={comment.id} className="relative">
                                {isFresh && (
                                    <span
                                        aria-label={t("newBadge")}
                                        className="pointer-events-none absolute right-2 top-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                                    >
                                        {t("newBadge")}
                                    </span>
                                )}
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
                        );
                    })}
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
                    {isFetchingNextPage ? tActions("loading") : t("loadMore")}
                </Button>
            )}

            {!isLoading && comments.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        </section>
    );
};
