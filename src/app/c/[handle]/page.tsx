import { headers } from "next/headers";
import { notFound } from "next/navigation";

import AppShell from "@/components/shell/AppShell";
import { ChannelHeader } from "@/components/channel/ChannelHeader";
import { ChannelTabs } from "@/components/channel/ChannelTabs";
import { VideoGrid } from "@/components/video/VideoGrid";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channelMembers, channels } from "@/server/db/schema/channels";
import { playlists } from "@/server/db/schema/playlists";
import { subscriptions } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";
import { and, count, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";

interface ChannelPageProps {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: ChannelPageProps): Promise<Metadata> {
    const { handle } = await params;
    const channel = await db
        .select({ name: channels.name })
        .from(channels)
        .where(eq(channels.handle, handle.toLowerCase()))
        .limit(1)
        .then((r) => r[0]);
    return { title: channel?.name ?? "Channel" };
}

const ChannelPage = async ({ params, searchParams }: ChannelPageProps) => {
    const { handle } = await params;
    const { tab = "videos" } = await searchParams;

    const session = await auth.api.getSession({ headers: await headers() });

    // Load full channel row (including ownerId) directly from DB.
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

    // Fetch subscriber count and membership/subscription status in parallel.
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

    const tabs = [
        { label: "Videos", href: `/c/${handle}?tab=videos`, active: tab === "videos" },
        { label: "Playlists", href: `/c/${handle}?tab=playlists`, active: tab === "playlists" },
        { label: "About", href: `/c/${handle}?tab=about`, active: tab === "about" },
    ];

    // Load tab content
    let tabContent: React.ReactNode;

    if (tab === "videos") {
        const channelVideos = await db
            .select({
                id: videos.id,
                title: videos.title,
                thumbnailPath: videos.thumbnailPath,
                durationSec: videos.durationSec,
                viewCount: videos.viewCount,
                publishedAt: videos.publishedAt,
            })
            .from(videos)
            .where(and(eq(videos.channelId, channel.id), eq(videos.privacy, "public"), eq(videos.status, "ready")))
            .orderBy(desc(videos.publishedAt))
            .limit(48)
            .catch(() => []);

        const videoList = channelVideos.map((v) => ({
            ...v,
            channel: { name: channel.name, handle: channel.handle },
        }));

        tabContent = (
            <VideoGrid
                videos={videoList}
                emptySlot={<p className="text-sm text-muted-foreground">No public videos yet.</p>}
            />
        );
    } else if (tab === "playlists") {
        // Public user-kind playlists for this channel owner.
        const channelPlaylists = await db
            .select({
                id: playlists.id,
                title: playlists.title,
                privacy: playlists.privacy,
            })
            .from(playlists)
            .where(
                and(
                    eq(playlists.ownerId, channel.ownerId),
                    eq(playlists.kind, "user"),
                    eq(playlists.privacy, "public"),
                ),
            )
            .orderBy(desc(playlists.updatedAt))
            .catch(() => []);

        tabContent =
            channelPlaylists.length === 0 ? (
                <p className="py-20 text-center text-sm text-muted-foreground">No public playlists yet.</p>
            ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                    {channelPlaylists.map((pl) => (
                        <a
                            key={pl.id}
                            href={`/playlist/${pl.id}`}
                            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:bg-secondary"
                        >
                            <div className="flex aspect-video items-center justify-center rounded-lg bg-secondary text-2xl text-muted-foreground">
                                &#9654;
                            </div>
                            <span className="line-clamp-2 font-medium text-foreground">{pl.title}</span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {pl.privacy}
                            </span>
                        </a>
                    ))}
                </div>
            );
    } else {
        tabContent = (
            <div className="max-w-2xl space-y-4">
                <h2 className="text-base font-semibold text-foreground">About</h2>
                {channel.description ? (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{channel.description}</p>
                ) : (
                    <p className="text-sm text-muted-foreground">This channel has no description yet.</p>
                )}
            </div>
        );
    }

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

                <ChannelTabs tabs={tabs} />

                <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">{tabContent}</div>
            </div>
        </AppShell>
    );
};

export default ChannelPage;
