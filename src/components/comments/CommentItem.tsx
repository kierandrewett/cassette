"use client";

import Link from "next/link";
import { useState } from "react";

import { Heart, MoreVertical, Pencil, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import { cn, formatCount, formatRelativeTime } from "@/lib/utils";
import { linkifyTimestamps } from "@/lib/timestamps";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommentComposer } from "./CommentComposer";

// Shape returned by comment.list / comment.listReplies.
export interface CommentData {
    id: string;
    videoId: string;
    parentId: string | null;
    rootId: string | null;
    body: string;
    isPinned: boolean;
    isHearted: boolean;
    editedAt: Date | null;
    likeCount: number;
    dislikeCount: number;
    createdAt: Date;
    replyCount: number;
    reactionByMe: "like" | "dislike" | null;
    author: {
        id: string | null;
        name: string | null;
        image: string | null;
        // md5(email) — server-computed so the client never sees the raw address.
        gravatarHash?: string | null;
        // Most-recent owned channel handle, if any. Used to link the author name.
        channelHandle?: string | null;
    };
}

interface CommentItemProps {
    comment: CommentData;
    /** Handle that owns the channel the video belongs to (for manager checks). */
    channelHandle?: string | null;
    /** Whether the current user is a channel owner/manager (pre-resolved by parent). */
    isChannelManager?: boolean;
    /** Called to expand/collapse the replies section. */
    onToggleReplies?: () => void;
    repliesOpen?: boolean;
    /** Called when a reply is submitted so the parent can refresh. */
    onReplySubmitted?: () => void;
}

export const CommentItem = ({
    comment,
    isChannelManager = false,
    onToggleReplies,
    repliesOpen = false,
    onReplySubmitted,
}: CommentItemProps) => {
    const { data: session } = useSession();
    const userId = session?.user?.id ?? null;
    const isAuthor = !!userId && userId === comment.author.id;

    const [reaction, setReaction] = useState<"like" | "dislike" | null>(comment.reactionByMe);
    const [likeDelta, setLikeDelta] = useState(0);
    const [dislikeDelta, setDislikeDelta] = useState(0);
    const [showReplyComposer, setShowReplyComposer] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [localBody, setLocalBody] = useState(comment.body);

    const utils = api.useUtils();

    const likeMutation = api.comment.like.useMutation({
        onSuccess: (data) => {
            const prev = reaction;
            setReaction(data.reactionByMe);
            // Adjust deltas relative to original counts.
            if (prev === "like" && data.reactionByMe === null) setLikeDelta((d) => d - 1);
            else if (prev !== "like" && data.reactionByMe === "like") {
                setLikeDelta((d) => d + 1);
                if (prev === "dislike") setDislikeDelta((d) => d - 1);
            }
        },
    });

    const dislikeMutation = api.comment.dislike.useMutation({
        onSuccess: (data) => {
            const prev = reaction;
            setReaction(data.reactionByMe);
            if (prev === "dislike" && data.reactionByMe === null) setDislikeDelta((d) => d - 1);
            else if (prev !== "dislike" && data.reactionByMe === "dislike") {
                setDislikeDelta((d) => d + 1);
                if (prev === "like") setLikeDelta((d) => d - 1);
            }
        },
    });

    const updateMutation = api.comment.update.useMutation({
        onSuccess: (updated) => {
            setLocalBody(updated.body);
            setIsEditing(false);
            void utils.comment.list.invalidate({ videoId: comment.videoId });
        },
    });

    const deleteMutation = api.comment.softDelete.useMutation({
        onSuccess: () => {
            void utils.comment.list.invalidate({ videoId: comment.videoId });
        },
    });

    const pinMutation = api.comment.pin.useMutation({
        onSuccess: () => void utils.comment.list.invalidate({ videoId: comment.videoId }),
    });

    const heartMutation = api.comment.heart.useMutation({
        onSuccess: () => void utils.comment.list.invalidate({ videoId: comment.videoId }),
    });

    const replyMutation = api.comment.create.useMutation({
        onSuccess: () => {
            setShowReplyComposer(false);
            onReplySubmitted?.();
        },
    });

    const handleReplySubmit = async (body: string) => {
        await replyMutation.mutateAsync({
            videoId: comment.videoId,
            body,
            parentId: comment.rootId ?? comment.id,
        });
    };

    const handleLike = () => {
        if (!userId) return;
        likeMutation.mutate({ id: comment.id });
    };

    const handleDislike = () => {
        if (!userId) return;
        dislikeMutation.mutate({ id: comment.id });
    };

    const displayLikes = comment.likeCount + likeDelta;
    const displayDislikes = comment.dislikeCount + dislikeDelta;

    const authorName = comment.author.name ?? "[deleted]";
    const authorHref = comment.author.channelHandle ? `/c/${comment.author.channelHandle}` : null;

    return (
        <div className="flex gap-3 py-3">
            {/* Avatar — Libravatar/Gravatar with initials fallback. */}
            <div className="shrink-0">
                {authorHref ? (
                    <Link href={authorHref} aria-label={`${authorName}'s channel`}>
                        <UserAvatar
                            user={{
                                name: comment.author.name,
                                image: comment.author.image,
                                gravatarHash: comment.author.gravatarHash,
                            }}
                            size={36}
                        />
                    </Link>
                ) : (
                    <UserAvatar
                        user={{
                            name: comment.author.name,
                            image: comment.author.image,
                            gravatarHash: comment.author.gravatarHash,
                        }}
                        size={36}
                    />
                )}
            </div>

            {/* Body */}
            <div className="min-w-0 flex-1">
                {/* Header row */}
                <div className="flex items-center gap-2 text-sm">
                    {authorHref ? (
                        <Link href={authorHref} className="font-medium text-foreground hover:underline">
                            {authorName}
                        </Link>
                    ) : (
                        <span className="font-medium text-foreground">{authorName}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                    {comment.editedAt && <span className="text-xs text-muted-foreground">(edited)</span>}
                    {comment.isPinned && (
                        <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                            Pinned
                        </span>
                    )}
                </div>

                {/* Comment body or edit form */}
                {isEditing ? (
                    <CommentComposer
                        initialValue={localBody}
                        submitLabel="Save"
                        onSubmit={async (body) => {
                            await updateMutation.mutateAsync({ id: comment.id, body });
                        }}
                        onCancel={() => setIsEditing(false)}
                        isPending={updateMutation.isPending}
                        className="mt-1"
                    />
                ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">{linkifyTimestamps(localBody)}</p>
                )}

                {/* Hearted indicator */}
                {comment.isHearted && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Heart className="h-3 w-3 fill-red-500 text-red-500" />
                        <span>Loved by the creator</span>
                    </div>
                )}

                {/* Reaction + Reply bar */}
                {!isEditing && (
                    <div className="mt-1 flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", reaction === "like" && "text-primary")}
                            onClick={handleLike}
                            aria-label={`Like (${displayLikes})`}
                            disabled={!userId || likeMutation.isPending}
                        >
                            <ThumbsUp className="h-4 w-4" />
                        </Button>
                        {displayLikes > 0 && (
                            <span className="min-w-[1.5rem] text-xs text-muted-foreground">
                                {formatCount(displayLikes)}
                            </span>
                        )}

                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-8 w-8", reaction === "dislike" && "text-primary")}
                            onClick={handleDislike}
                            aria-label={`Dislike (${displayDislikes})`}
                            disabled={!userId || dislikeMutation.isPending}
                        >
                            <ThumbsDown className="h-4 w-4" />
                        </Button>

                        {userId && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="ml-1 h-8 text-xs"
                                onClick={() => setShowReplyComposer((v) => !v)}
                            >
                                Reply
                            </Button>
                        )}

                        {comment.replyCount > 0 && onToggleReplies && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="ml-1 h-8 text-xs text-primary"
                                onClick={onToggleReplies}
                            >
                                {repliesOpen
                                    ? "Hide replies"
                                    : `View ${comment.replyCount} repl${comment.replyCount === 1 ? "y" : "ies"}`}
                            </Button>
                        )}

                        {/* Overflow menu for author + managers */}
                        {(isAuthor || isChannelManager) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="ml-auto h-8 w-8">
                                        <MoreVertical className="h-4 w-4" />
                                        <span className="sr-only">Comment options</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {isAuthor && (
                                        <DropdownMenuItem onClick={() => setIsEditing(true)}>
                                            <Pencil className="mr-2 h-4 w-4" />
                                            Edit
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() => deleteMutation.mutate({ id: comment.id })}
                                        className="text-destructive"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </DropdownMenuItem>
                                    {isChannelManager && (
                                        <>
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    pinMutation.mutate({ id: comment.id, pinned: !comment.isPinned })
                                                }
                                            >
                                                {comment.isPinned ? "Unpin comment" : "Pin comment"}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    heartMutation.mutate({
                                                        id: comment.id,
                                                        hearted: !comment.isHearted,
                                                    })
                                                }
                                            >
                                                <Heart className="mr-2 h-4 w-4" />
                                                {comment.isHearted ? "Remove heart" : "Heart comment"}
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                )}

                {/* Inline reply composer */}
                {showReplyComposer && (
                    <CommentComposer
                        placeholder="Add a reply…"
                        onSubmit={handleReplySubmit}
                        onCancel={() => setShowReplyComposer(false)}
                        className="mt-2"
                    />
                )}
            </div>
        </div>
    );
};
