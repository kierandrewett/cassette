"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

type PendingComment = {
    id: string;
    videoId: string;
    videoPublicId: string;
    videoTitle: string;
    parentId: string | null;
    body: string;
    createdAt: Date;
    author: {
        id: string | null;
        name: string | null;
        image: string | null;
        gravatarHash: string | null;
    };
};

interface ModerationQueueProps {
    channelId: string;
    initialItems: PendingComment[];
}

const formatTime = (d: Date): string => formatRelativeTime(d);

export const ModerationQueue = ({ channelId, initialItems }: ModerationQueueProps) => {
    const utils = api.useUtils();

    // Server-rendered first batch; subsequent renders pull from the query
    // cache and the optimistic-removal local state below.
    const query = api.comment.listPending.useQuery(
        { channelId, limit: 50 },
        { initialData: initialItems as PendingComment[] },
    );

    // Local pessimistic-on-error pattern: on click we hide the row, then
    // restore it if the mutation rejects. Cheaper than a full invalidate +
    // refetch loop and gives immediate feedback.
    const [removed, setRemoved] = useState<Set<string>>(new Set());

    const approve = api.comment.approve.useMutation({
        onSuccess: () => {
            void utils.comment.listPending.invalidate({ channelId });
        },
        onError: (err, vars) => {
            setRemoved((prev) => {
                const next = new Set(prev);
                next.delete(vars.commentId);
                return next;
            });
            toast.error(err.message ?? "Failed to approve comment.");
        },
    });

    const reject = api.comment.reject.useMutation({
        onSuccess: () => {
            void utils.comment.listPending.invalidate({ channelId });
        },
        onError: (err, vars) => {
            setRemoved((prev) => {
                const next = new Set(prev);
                next.delete(vars.commentId);
                return next;
            });
            toast.error(err.message ?? "Failed to reject comment.");
        },
    });

    const items = (query.data ?? initialItems).filter((c) => !removed.has(c.id));

    if (items.length === 0) {
        return (
            <div className="rounded-2xl border border-border bg-card/40 p-12 text-center">
                <p className="text-base font-medium text-foreground">Nothing in the queue.</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    New comments held for moderation will appear here.
                </p>
            </div>
        );
    }

    const onAction = (id: string, action: "approve" | "reject") => {
        setRemoved((prev) => new Set(prev).add(id));
        if (action === "approve") {
            approve.mutate({ commentId: id });
        } else {
            reject.mutate({ commentId: id });
        }
    };

    return (
        <ul className="space-y-3">
            {items.map((c) => (
                <li
                    key={c.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start"
                >
                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{c.author.name ?? "Anonymous"}</span>
                            <span aria-hidden>·</span>
                            <span>{formatTime(c.createdAt)}</span>
                            <span aria-hidden>·</span>
                            <Link
                                href={`/watch/${c.videoPublicId ?? c.videoId}`}
                                className="truncate text-foreground/80 underline-offset-4 hover:underline"
                            >
                                {c.videoTitle}
                            </Link>
                            {c.parentId ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                                    Reply
                                </span>
                            ) : null}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{c.body}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <button
                            type="button"
                            onClick={() => onAction(c.id, "approve")}
                            disabled={approve.isPending || reject.isPending}
                            className={cn(
                                "inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium",
                                "text-primary-foreground shadow transition-colors hover:bg-primary/90",
                                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            Approve
                        </button>
                        <button
                            type="button"
                            onClick={() => onAction(c.id, "reject")}
                            disabled={approve.isPending || reject.isPending}
                            className={cn(
                                "inline-flex h-8 items-center justify-center rounded-md border border-destructive/40 bg-transparent px-3 text-xs font-medium",
                                "text-destructive shadow-sm transition-colors hover:bg-destructive/10",
                                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            Reject
                        </button>
                    </div>
                </li>
            ))}
        </ul>
    );
};
