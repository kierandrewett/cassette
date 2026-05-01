import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/shell/AppShell";
import { LibraryRow } from "@/components/library/LibraryRow";
import { CreatePlaylistTile } from "@/components/library/CreatePlaylistTile";
import { VideoCard } from "@/components/video/VideoCard";
import { QueueRow } from "@/components/library/QueueRow";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { watchHistory, watchProgress } from "@/server/db/schema/history";
import { playlistItems, playlists } from "@/server/db/schema/playlists";
import { subscriptions } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Library" };

const LibraryPage = async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        redirect("/login");
    }
    const userId = session.user.id;

    // Resolve (or skip) system playlists without creating them — they'll be
    // created on first use by the tRPC mutation procedures.
    const systemPlaylists = await db
        .select({ id: playlists.id, kind: playlists.kind })
        .from(playlists)
        .where(
            and(
                eq(playlists.ownerId, userId),
                inArray(playlists.kind, ["queue", "watch_later"]),
            ),
        );

    const queuePlaylistId = systemPlaylists.find((p) => p.kind === "queue")?.id;
    const watchLaterPlaylistId = systemPlaylists.find((p) => p.kind === "watch_later")?.id;

    // Fetch all sections in parallel.
    const [queueItems, continueRows, recentRows, watchLaterItems, userPlaylists, subChannelIds] = await Promise.all([
        // Queue items
        queuePlaylistId
            ? db
                  .select({
                      itemId: playlistItems.id,
                      video: {
                          id: videos.id,
                          title: videos.title,
                          thumbnailPath: videos.thumbnailPath,
                          durationSec: videos.durationSec,
                          viewCount: videos.viewCount,
                          publishedAt: videos.publishedAt,
                      },
                      channel: { name: channels.name, handle: channels.handle },
                  })
                  .from(playlistItems)
                  .innerJoin(videos, eq(videos.id, playlistItems.videoId))
                  .innerJoin(channels, eq(channels.id, videos.channelId))
                  .where(eq(playlistItems.playlistId, queuePlaylistId))
                  .orderBy(asc(playlistItems.position))
                  .limit(12)
            : Promise.resolve([]),

        // Continue watching — history entries with an incomplete watchProgress record.
        // INNER JOIN with watchProgress filtered to completed=false so only videos
        // the user has started (beacon fired) but not yet finished are shown.
        db
            .select({
                historyId: watchHistory.id,
                watchedAt: watchHistory.watchedAt,
                video: {
                    id: videos.id,
                    title: videos.title,
                    thumbnailPath: videos.thumbnailPath,
                    durationSec: videos.durationSec,
                    viewCount: videos.viewCount,
                    publishedAt: videos.publishedAt,
                },
                channel: { name: channels.name, handle: channels.handle },
            })
            .from(watchHistory)
            .innerJoin(videos, eq(videos.id, watchHistory.videoId))
            .innerJoin(channels, eq(channels.id, videos.channelId))
            .innerJoin(
                watchProgress,
                and(
                    eq(watchProgress.userId, watchHistory.userId),
                    eq(watchProgress.videoId, watchHistory.videoId),
                    eq(watchProgress.completed, false),
                ),
            )
            .where(eq(watchHistory.userId, userId))
            .orderBy(desc(watchHistory.watchedAt))
            .limit(12),

        // Recent history — unfiltered, for the "Recent" row at the bottom.
        db
            .select({
                historyId: watchHistory.id,
                watchedAt: watchHistory.watchedAt,
                video: {
                    id: videos.id,
                    title: videos.title,
                    thumbnailPath: videos.thumbnailPath,
                    durationSec: videos.durationSec,
                    viewCount: videos.viewCount,
                    publishedAt: videos.publishedAt,
                },
                channel: { name: channels.name, handle: channels.handle },
            })
            .from(watchHistory)
            .innerJoin(videos, eq(videos.id, watchHistory.videoId))
            .innerJoin(channels, eq(channels.id, videos.channelId))
            .where(eq(watchHistory.userId, userId))
            .orderBy(desc(watchHistory.watchedAt))
            .limit(8),

        // Watch Later items
        watchLaterPlaylistId
            ? db
                  .select({
                      itemId: playlistItems.id,
                      video: {
                          id: videos.id,
                          title: videos.title,
                          thumbnailPath: videos.thumbnailPath,
                          durationSec: videos.durationSec,
                          viewCount: videos.viewCount,
                          publishedAt: videos.publishedAt,
                      },
                      channel: { name: channels.name, handle: channels.handle },
                  })
                  .from(playlistItems)
                  .innerJoin(videos, eq(videos.id, playlistItems.videoId))
                  .innerJoin(channels, eq(channels.id, videos.channelId))
                  .where(eq(playlistItems.playlistId, watchLaterPlaylistId))
                  .orderBy(desc(playlistItems.addedAt))
                  .limit(12)
            : Promise.resolve([]),

        // User-created playlists (kind='user')
        db
            .select({ id: playlists.id, title: playlists.title, privacy: playlists.privacy })
            .from(playlists)
            .where(and(eq(playlists.ownerId, userId), eq(playlists.kind, "user")))
            .orderBy(desc(playlists.updatedAt)),

        // Subscribed channel IDs for the feed
        db
            .select({ channelId: subscriptions.channelId })
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId)),
    ]);

    // Subscription feed: last 8 public ready videos from subscribed channels.
    const subVideos =
        subChannelIds.length > 0
            ? await db
                  .select({
                      id: videos.id,
                      title: videos.title,
                      thumbnailPath: videos.thumbnailPath,
                      durationSec: videos.durationSec,
                      viewCount: videos.viewCount,
                      publishedAt: videos.publishedAt,
                      channel: { name: channels.name, handle: channels.handle },
                  })
                  .from(videos)
                  .innerJoin(channels, eq(channels.id, videos.channelId))
                  .where(
                      and(
                          inArray(
                              videos.channelId,
                              subChannelIds.map((r) => r.channelId),
                          ),
                          eq(videos.privacy, "public"),
                          eq(videos.status, "ready"),
                      ),
                  )
                  .orderBy(desc(videos.publishedAt))
                  .limit(8)
            : [];

    return (
        <AppShell>
            <div className="mx-auto max-w-7xl space-y-10 py-8">
                <h1 className="px-4 text-2xl font-semibold text-foreground md:px-6">Library</h1>

                {/* Up Next (queue). Renders as a horizontal drag-reorderable
                    strip via QueueRow; if the queue does not yet exist for this
                    user, fall back to an empty LibraryRow with a CTA. */}
                {queuePlaylistId ? (
                    <QueueRow
                        playlistId={queuePlaylistId}
                        initialItems={queueItems.map((item, idx) => ({
                            itemId: item.itemId,
                            position: idx,
                            video: {
                                id: item.video.id,
                                title: item.video.title,
                                thumbnailPath: item.video.thumbnailPath,
                                durationSec: item.video.durationSec,
                            },
                            channel: { name: item.channel.name, handle: item.channel.handle },
                        }))}
                    />
                ) : (
                    <LibraryRow
                        heading="Up Next"
                        isEmpty
                        emptyMessage="Add videos to your queue and they'll appear here on every device."
                    >
                        {null}
                    </LibraryRow>
                )}

                {/* Continue watching — incomplete watchProgress only */}
                <LibraryRow
                    heading="Continue watching"
                    isEmpty={continueRows.length === 0}
                    emptyMessage="Videos you've started watching will appear here."
                >
                    {continueRows.map((item) => (
                        <div key={item.historyId} className="w-56 flex-shrink-0">
                            <VideoCard video={{ ...item.video, channel: item.channel }} />
                        </div>
                    ))}
                </LibraryRow>

                {/* Watch Later */}
                <LibraryRow
                    heading="Watch Later"
                    isEmpty={watchLaterItems.length === 0}
                    emptyMessage="Videos you save for later will appear here."
                >
                    {watchLaterItems.map((item) => (
                        <div key={item.itemId} className="w-56 flex-shrink-0">
                            <VideoCard video={{ ...item.video, channel: item.channel }} />
                        </div>
                    ))}
                </LibraryRow>

                {/* Your Playlists */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between px-4 md:px-6">
                        <h2 className="text-base font-semibold text-foreground">Your Playlists</h2>
                    </div>
                    <div className="flex gap-3 overflow-x-auto px-4 pb-2 md:px-6" style={{ scrollbarWidth: "none" }}>
                        {userPlaylists.map((pl) => (
                            <Link
                                key={pl.id}
                                href={`/playlist/${pl.id}`}
                                className="flex h-40 w-36 flex-shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-center transition-colors hover:bg-secondary"
                            >
                                <div className="text-2xl">&#9654;</div>
                                <span className="line-clamp-2 text-xs font-medium text-foreground">{pl.title}</span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {pl.privacy}
                                </span>
                            </Link>
                        ))}
                        <CreatePlaylistTile />
                    </div>
                </section>

                {/* Recent history — unfiltered */}
                <LibraryRow
                    heading="Recent"
                    seeAllHref="/history"
                    isEmpty={recentRows.length === 0}
                    emptyMessage="Videos you watch will appear here."
                >
                    {recentRows.map((item) => (
                        <div key={item.historyId} className="w-56 flex-shrink-0">
                            <VideoCard video={{ ...item.video, channel: item.channel }} />
                        </div>
                    ))}
                </LibraryRow>

                {/* Subscriptions feed */}
                <LibraryRow
                    heading="Subscriptions"
                    seeAllHref="/subscriptions"
                    isEmpty={subVideos.length === 0}
                    emptyMessage="Subscribe to channels to see their latest videos here."
                >
                    {subVideos.map((video) => (
                        <div key={video.id} className="w-56 flex-shrink-0">
                            <VideoCard video={video} />
                        </div>
                    ))}
                </LibraryRow>
            </div>
        </AppShell>
    );
};

export default LibraryPage;
