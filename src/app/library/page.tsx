import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
    PlaySquareIcon,
    BookmarkAdd02Icon,
    Time04Icon,
    LibraryIcon,
    Notification03Icon,
    VideoReplayIcon,
} from "hugeicons-react";

import AppShell from "@/components/shell/AppShell";
import { LibraryRow } from "@/components/library/LibraryRow";
import { CreatePlaylistTile } from "@/components/library/CreatePlaylistTile";
import { PlaylistTile } from "@/components/library/PlaylistTile";
import { EmptyShelfCard } from "@/components/library/EmptyShelfCard";
import { VideoCard } from "@/components/video/VideoCard";
import { QueueRow } from "@/components/library/QueueRow";
import { getSession } from "@/lib/session";
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
    const session = await getSession();
    if (!session?.user) {
        redirect("/login");
    }
    const userId = session.user.id;

    // Section headings + the page title come from the i18n bundle so a future
    // locale doesn't need to fork the layout. Body copy on the empty cards
    // stays inline for now — translating them is a follow-up pass.
    const tLibrary = await getTranslations("library");
    const tNav = await getTranslations("nav");

    // Resolve (or skip) system playlists without creating them — they're
    // created on first use by the tRPC mutation procedures.
    const systemPlaylists = await db
        .select({ id: playlists.id, kind: playlists.kind })
        .from(playlists)
        .where(and(eq(playlists.ownerId, userId), inArray(playlists.kind, ["queue", "watch_later"])));

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
                      channel: {
                          id: channels.id,
                          name: channels.name,
                          handle: channels.handle,
                          avatarPath: channels.avatarPath,
                      },
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
                channel: {
                    id: channels.id,
                    name: channels.name,
                    handle: channels.handle,
                    avatarPath: channels.avatarPath,
                },
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

        // Recent history — unfiltered, for the "Recent" row near the bottom.
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
                channel: {
                    id: channels.id,
                    name: channels.name,
                    handle: channels.handle,
                    avatarPath: channels.avatarPath,
                },
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
                      channel: {
                          id: channels.id,
                          name: channels.name,
                          handle: channels.handle,
                          avatarPath: channels.avatarPath,
                      },
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
        db.select({ channelId: subscriptions.channelId }).from(subscriptions).where(eq(subscriptions.userId, userId)),
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
                      channel: {
                          id: channels.id,
                          name: channels.name,
                          handle: channels.handle,
                          avatarPath: channels.avatarPath,
                      },
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
            {/* Generous gap-12 between shelves matches the Apple-TV brief; py-8
                gives a little air at the top and bottom of the page. */}
            <div className="space-y-12 py-8">
                <div className="px-4 md:px-6">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">{tNav("library")}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Everything you&rsquo;ve saved, started, or subscribed to.
                    </p>
                </div>

                {/* Up Next (queue). Drag-reorderable on populated state via
                    QueueRow; when empty, render a clean empty card instead of
                    an unstyled CTA. Wrap the populated case in LibraryRow too
                    so the section heading is consistent with every other
                    shelf — without it the queue items rendered as floating
                    cards with no label, leaving the user wondering what
                    they were looking at. */}
                {queuePlaylistId && queueItems.length > 0 ? (
                    <LibraryRow heading={tLibrary("upNext")} caption="Your cross-device queue">
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
                    </LibraryRow>
                ) : (
                    <LibraryRow heading={tLibrary("upNext")} caption="Your cross-device queue">
                        <EmptyShelfCard
                            Icon={PlaySquareIcon}
                            title="Nothing queued"
                            description="Add videos to your queue and they'll appear here on every device."
                            cta={{ label: "Browse home", href: "/" }}
                        />
                    </LibraryRow>
                )}

                {/* Continue watching — incomplete watchProgress only */}
                <LibraryRow heading={tLibrary("continueWatching")}>
                    {continueRows.length > 0 ? (
                        continueRows.map((item) => (
                            <div key={item.historyId} className="w-80 flex-shrink-0">
                                <VideoCard video={{ ...item.video, channel: item.channel }} />
                            </div>
                        ))
                    ) : (
                        <EmptyShelfCard
                            Icon={VideoReplayIcon}
                            title="Pick up where you left off"
                            description="Videos you've started but haven't finished show up here."
                            cta={{ label: "Browse home", href: "/" }}
                        />
                    )}
                </LibraryRow>

                {/* Watch Later */}
                <LibraryRow heading={tLibrary("watchLater")}>
                    {watchLaterItems.length > 0 ? (
                        watchLaterItems.map((item) => (
                            <div key={item.itemId} className="w-80 flex-shrink-0">
                                <VideoCard video={{ ...item.video, channel: item.channel }} />
                            </div>
                        ))
                    ) : (
                        <EmptyShelfCard
                            Icon={BookmarkAdd02Icon}
                            title="Save videos for later"
                            description="Tap the bookmark on any video to add it to Watch Later."
                            cta={{ label: "Browse home", href: "/" }}
                        />
                    )}
                </LibraryRow>

                {/* Your Playlists — playlists are now rendered via PlaylistTile so
                    the create tile shares its dimensions and hover treatment. */}
                <LibraryRow heading={tLibrary("yourPlaylists")}>
                    {userPlaylists.length === 0 && (
                        <EmptyShelfCard
                            Icon={LibraryIcon}
                            title="No playlists yet"
                            description="Group your favourite videos into curated lists."
                            variant="playlist"
                        />
                    )}
                    {userPlaylists.map((pl) => (
                        <PlaylistTile key={pl.id} id={pl.id} title={pl.title} privacy={pl.privacy} />
                    ))}
                    {/* Create tile sits at the END so existing playlists read first. */}
                    <CreatePlaylistTile />
                </LibraryRow>

                {/* Recent history — unfiltered */}
                <LibraryRow heading={tLibrary("recent")} seeAllHref="/history">
                    {recentRows.length > 0 ? (
                        recentRows.map((item) => (
                            <div key={item.historyId} className="w-80 flex-shrink-0">
                                <VideoCard video={{ ...item.video, channel: item.channel }} />
                            </div>
                        ))
                    ) : (
                        <EmptyShelfCard
                            Icon={Time04Icon}
                            title="No history yet"
                            description="Your watched videos will appear here."
                        />
                    )}
                </LibraryRow>

                {/* Subscriptions feed */}
                <LibraryRow heading={tLibrary("subscriptions")} seeAllHref="/subscriptions">
                    {subVideos.length > 0 ? (
                        subVideos.map((video) => (
                            <div key={video.id} className="w-80 flex-shrink-0">
                                <VideoCard video={video} />
                            </div>
                        ))
                    ) : (
                        <EmptyShelfCard
                            Icon={Notification03Icon}
                            title="Subscribe to see updates"
                            description="Subscribe to channels and their latest videos will land here."
                            cta={{ label: "Discover channels", href: "/" }}
                        />
                    )}
                </LibraryRow>
            </div>
        </AppShell>
    );
};

export default LibraryPage;
