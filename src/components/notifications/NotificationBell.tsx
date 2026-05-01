"use client";

import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/trpc/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/shared/UserAvatar";

// NotificationBell drives the header bell + unread count badge.
//
// Behaviour:
// - Polls `notification.unreadCount` every 60 s while the bell is visible.
// - On open, fetches the most recent 20 notifications.
// - "Mark all as read" calls notification.markAllRead and refetches the count.
// - Clicking an item navigates to its target and marks just that row read.
//
// We deliberately keep this dependency-free of websockets for v1; polling at
// 60 s matches the operator constraints described in PLAN section 1.

export const NotificationBell = ({ enabled }: { enabled: boolean }) => {
    const [open, setOpen] = useState(false);

    const unread = api.notification.unreadCount.useQuery(undefined, {
        enabled,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    });

    const list = api.notification.list.useQuery(
        { limit: 20 },
        {
            enabled: enabled && open,
            refetchOnWindowFocus: false,
        },
    );

    const utils = api.useUtils();

    const markAllRead = api.notification.markAllRead.useMutation({
        onSuccess: async () => {
            await Promise.all([utils.notification.unreadCount.invalidate(), utils.notification.list.invalidate()]);
        },
    });

    const markRead = api.notification.markRead.useMutation({
        onSuccess: async () => {
            await Promise.all([utils.notification.unreadCount.invalidate(), utils.notification.list.invalidate()]);
        },
    });

    const count = unread.data ?? 0;

    // Prepend "(N) " to the browser tab title when there are unread notifications.
    // Restores the previous title on unmount or when count drops to zero.
    useEffect(() => {
        if (!enabled || count === 0) return;
        const prev = document.title;
        // Avoid double-prepending if the title already starts with a count badge.
        const bare = prev.replace(/^\(\d+\) /, "");
        document.title = `(${count}) ${bare}`;
        return () => {
            document.title = bare;
        };
    }, [count, enabled]);

    if (!enabled) {
        return (
            <Button
                variant="ghost"
                size="icon"
                aria-label="Notifications"
                disabled
                className="rounded-lg text-muted-foreground"
            >
                <Bell className="h-5 w-5" />
            </Button>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={count > 0 ? `Notifications (${count} unread)` : "Notifications"}
                    className="relative rounded-lg text-muted-foreground hover:text-foreground"
                >
                    <Bell className="h-5 w-5" />
                    {count > 0 ? (
                        <span
                            className={cn(
                                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white",
                            )}
                        >
                            {count > 99 ? "99+" : count}
                        </span>
                    ) : null}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <p className="text-sm font-semibold">Notifications</p>
                    {count > 0 ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}
                            className="h-7 gap-1 text-xs"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Mark all read
                        </Button>
                    ) : null}
                </div>
                <ScrollArea className="h-[420px]">
                    {list.isLoading ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            Loading…
                        </div>
                    ) : list.data?.items.length === 0 ? (
                        // Vertically centred empty state with a soft bell
                        // illustration. h-full inside the fixed-height
                        // ScrollArea pins it to the middle so the popover
                        // doesn't read as broken when there's nothing to show.
                        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                            <span
                                aria-hidden="true"
                                className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground"
                            >
                                <Bell className="h-8 w-8" strokeWidth={1.5} />
                            </span>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">You are all caught up</p>
                                <p className="text-xs text-muted-foreground">
                                    New uploads from your subscriptions and replies to your comments will land here.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {list.data?.items.map((n) => {
                                // Actor avatar — channels feed `image` from their
                                // explicit avatar upload; comment authors fall
                                // through to libravatar via `gravatarHash`.
                                const avatarUser =
                                    n.actor?.kind === "channel"
                                        ? {
                                              name: n.actor.name,
                                              image: n.actor.avatarPath
                                                  ? `/api/channel/${n.actor.channelId}/asset/avatar`
                                                  : null,
                                          }
                                        : n.actor?.kind === "user"
                                          ? {
                                                name: n.actor.name,
                                                image: n.actor.image,
                                                gravatarHash: n.actor.gravatarHash,
                                            }
                                          : { name: null };

                                const headline =
                                    n.kind === "new_upload"
                                        ? n.actor?.kind === "channel"
                                            ? `${n.actor.name} uploaded a new video.`
                                            : "A channel you subscribe to uploaded a new video."
                                        : n.actor?.kind === "user"
                                          ? `${n.actor.name ?? "Someone"} replied to your comment.`
                                          : "Someone replied to your comment.";

                                return (
                                    <li key={n.id}>
                                        <Link
                                            href={
                                                n.kind === "new_upload" && n.videoId
                                                    ? `/watch/${n.videoId}`
                                                    : n.kind === "comment_reply" && n.videoId
                                                      ? `/watch/${n.videoId}#comment-${n.commentId ?? ""}`
                                                      : "/"
                                            }
                                            onClick={() => {
                                                if (!n.readAt) markRead.mutate({ id: n.id });
                                                setOpen(false);
                                            }}
                                            className={cn(
                                                "flex items-start gap-3 px-4 py-3 transition hover:bg-accent",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                !n.readAt && "bg-accent/40",
                                            )}
                                        >
                                            <UserAvatar user={avatarUser} size={36} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm leading-snug">{headline}</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {formatRelativeTime(n.createdAt)}
                                                </p>
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};
