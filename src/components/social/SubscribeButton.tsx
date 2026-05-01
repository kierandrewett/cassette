"use client";

import { useState } from "react";

import { Bell, BellOff } from "lucide-react";
import Link from "next/link";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SubscribeButtonProps {
    channelId: string;
    /** Initial subscription state — pass from SSR to avoid flash. */
    initialSubscribed?: boolean;
    /** Initial notify flag. */
    initialNotify?: boolean;
    className?: string;
}

export const SubscribeButton = ({
    channelId,
    initialSubscribed = false,
    initialNotify = true,
    className,
}: SubscribeButtonProps) => {
    const { data: session } = useSession();

    const [subscribed, setSubscribed] = useState(initialSubscribed);
    const [notify, setNotify] = useState(initialNotify);

    const utils = api.useUtils();

    const subscribeMutation = api.subscription.subscribe.useMutation({
        onMutate: () => {
            setSubscribed(true);
            setNotify(true);
        },
        onError: () => {
            setSubscribed(false);
        },
        onSettled: async () => {
            await Promise.all([
                utils.subscription.isSubscribed.invalidate({ channelId }),
                utils.channel.byHandle.invalidate(),
            ]);
        },
    });

    const unsubscribeMutation = api.subscription.unsubscribe.useMutation({
        onMutate: () => {
            setSubscribed(false);
        },
        onError: () => {
            setSubscribed(true);
        },
        onSettled: async () => {
            await Promise.all([
                utils.subscription.isSubscribed.invalidate({ channelId }),
                utils.channel.byHandle.invalidate(),
            ]);
        },
    });

    const setNotifyMutation = api.subscription.setNotify.useMutation({
        onSuccess: (data) => {
            setNotify(data.notify);
        },
    });

    const busy = subscribeMutation.isPending || unsubscribeMutation.isPending || setNotifyMutation.isPending;

    // Unauthenticated: link to login.
    if (!session?.user) {
        return (
            <Button asChild className={cn("rounded-full", className)} variant="default">
                <Link href="/login">Subscribe</Link>
            </Button>
        );
    }

    if (!subscribed) {
        return (
            <Button
                className={cn("rounded-full", className)}
                onClick={() => subscribeMutation.mutate({ channelId, notify: true })}
                disabled={busy}
            >
                Subscribe
            </Button>
        );
    }

    // Subscribed state: filled "Subscribed" pill with bell-toggle dropdown.
    return (
        <div className={cn("flex items-center", className)}>
            <Button
                variant="secondary"
                className="rounded-l-full rounded-r-none border-r border-border pr-3"
                onClick={() => unsubscribeMutation.mutate({ channelId })}
                disabled={busy}
                aria-label="Unsubscribe"
            >
                Subscribed
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-l-none rounded-r-full"
                        aria-label="Notification settings"
                        disabled={busy}
                    >
                        {notify ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                        onClick={() => setNotifyMutation.mutate({ channelId, notify: true })}
                        className={cn(notify && "font-medium")}
                    >
                        <Bell className="mr-2 h-4 w-4" />
                        All notifications
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setNotifyMutation.mutate({ channelId, notify: false })}
                        className={cn(!notify && "font-medium")}
                    >
                        <BellOff className="mr-2 h-4 w-4" />
                        No notifications
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};
