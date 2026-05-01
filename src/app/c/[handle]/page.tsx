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

    const name = channel?.name ?? "Channel";

    return {
        title: name,
        alternates: {
            types: {
                "application/rss+xml": `/c/${handle}/feed.xml`,
            },
        },
    };
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
            pinnedVideoId: channels.pinnedVideoId,
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
                description: videos.description,
                thumbnailPath: videos.thumbnailPath,
                durationSec: videos.durationSec,
                viewCount: videos.viewCount,
                publishedAt: videos.publishedAt,
                publicId: videos.publicId,
            })
            .from(videos)
            .where(
                and(
                    eq(videos.channelId, channel.id),
                    eq(videos.privacy, "public"),
                    eq(videos.status, "ready"),
                    eq(videos.isDraft, false),
                ),
            )
            .orderBy(desc(videos.publishedAt))
            .limit(48)
            .catch(() => []);

        // Hoist the pinned trailer (if set) to the top of the list and
        // render a hero card above the grid. We still keep it in the grid
        // so the layout doesn't go from "12 videos" to "11 + a hero".
        const pinned = channel.pinnedVideoId
            ? (channelVideos.find((v) => v.id === channel.pinnedVideoId) ?? null)
            : null;

        const videoList = channelVideos.map((v) => ({
            ...v,
            channel: { name: channel.name, handle: channel.handle },
        }));

        tabContent = (
            <div className="space-y-8">
                {pinned ? (
                    <a
                        href={`/watch/${pinned.publicId ?? pinned.id}`}
                        className="block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2">
                            <div className="relative aspect-video bg-secondary">
                                {pinned.thumbnailPath ? (
                                    // Hero thumbnail; sized lazily via Next/Image elsewhere — here we use a plain img to
                                    // keep the channel page server-rendered and avoid an extra client island.
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={`/api/hls/${pinned.id}/thumb/sprite.jpg`}
                                        alt={pinned.title}
                                        className="absolute inset-0 h-full w-full object-cover"
                                    />
                                ) : null}
                                <span className="absolute left-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
                                    Featured
                                </span>
                            </div>
                            <div className="flex flex-col justify-center gap-3 p-6">
                                <h2 className="line-clamp-2 text-xl font-semibold text-foreground">{pinned.title}</h2>
                                {pinned.description ? (
                                    <p className="line-clamp-3 text-sm text-muted-foreground">{pinned.description}</p>
                                ) : null}
                                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                                    Play
                                </span>
                            </div>
                        </div>
                    </a>
                ) : null}

                <VideoGrid
                    videos={videoList}
                    emptySlot={<p className="text-sm text-muted-foreground">No public videos yet.</p>}
                />
            </div>
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

                <div className="px-4 py-6 md:px-6 lg:px-8">{tabContent}</div>
            </div>
        </AppShell>
    );
};

export default ChannelPage;
