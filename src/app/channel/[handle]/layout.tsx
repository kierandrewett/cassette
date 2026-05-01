import { notFound } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";

import AppShell from "@/components/shell/AppShell";
import { ChannelHeader } from "@/components/channel/ChannelHeader";
import { ChannelTabs } from "@/components/channel/ChannelTabs";
import { getSession } from "@/lib/session";
import { db } from "@/server/db/client";
import { channelMembers, channels } from "@/server/db/schema/channels";
import { subscriptions } from "@/server/db/schema/social";

interface ChannelLayoutProps {
    children: React.ReactNode;
    params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: ChannelLayoutProps): Promise<Metadata> {
    const { handle } = await params;
    const channel = await db
        .select({ name: channels.name })
        .from(channels)
        .where(eq(channels.handle, handle.toLowerCase()))
        .limit(1)
        .then((r) => r[0]);

    const name = channel?.name ?? "Channel";

    return {
        title: name,
        alternates: {
            types: {
                "application/rss+xml": `/channel/${handle}/feed.xml`,
            },
        },
    };
}

// Channel layout: renders the AppShell, header, and tab nav. Each
// /channel/<handle>/<tab>/page.tsx renders just the tab content within
// {children}. The header data is loaded once per request and shared across
// the layout + child pages via Next's per-request fetch caching at the DB
// level (each tab does its own scoped query for its content).
const ChannelLayout = async ({ children, params }: ChannelLayoutProps) => {
    const { handle } = await params;

    const session = await getSession();

    const channel = await db
        .select({
            id: channels.id,
            handle: channels.handle,
            name: channels.name,
            description: channels.description,
            avatarPath: channels.avatarPath,
            bannerPath: channels.bannerPath,
            ownerId: channels.ownerId,
        })
        .from(channels)
        .where(eq(channels.handle, handle.toLowerCase()))
        .limit(1)
        .then((r) => r[0]);

    if (!channel) notFound();

    const [subCountResult, membershipResult, subscriptionResult] = await Promise.allSettled([
        db.select({ value: count() }).from(subscriptions).where(eq(subscriptions.channelId, channel.id)),
        session?.user
            ? db
                  .select({ role: channelMembers.role })
                  .from(channelMembers)
                  .where(and(eq(channelMembers.channelId, channel.id), eq(channelMembers.userId, session.user.id)))
                  .limit(1)
            : Promise.resolve([]),
        session?.user
            ? db
                  .select({ userId: subscriptions.userId })
                  .from(subscriptions)
                  .where(and(eq(subscriptions.channelId, channel.id), eq(subscriptions.userId, session.user.id)))
                  .limit(1)
            : Promise.resolve([]),
    ]);

    const subscriberCount = subCountResult.status === "fulfilled" ? (subCountResult.value[0]?.value ?? 0) : 0;
    const isMember = membershipResult.status === "fulfilled" && membershipResult.value.length > 0;
    const isSubscribed = subscriptionResult.status === "fulfilled" && subscriptionResult.value.length > 0;

    return (
        <AppShell>
            <div>
                <ChannelHeader
                    id={channel.id}
                    handle={channel.handle}
                    name={channel.name}
                    description={channel.description ?? ""}
                    avatarPath={channel.avatarPath ?? null}
                    bannerPath={channel.bannerPath ?? null}
                    subscriberCount={subscriberCount}
                    isOwner={isMember}
                    isSubscribed={isSubscribed}
                />

                <ChannelTabs handle={channel.handle} />

                <div className="px-4 py-6 md:px-6 lg:px-8">{children}</div>
            </div>
        </AppShell>
    );
};

export default ChannelLayout;
