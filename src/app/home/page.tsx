import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/shell/AppShell";
import { VideoGrid } from "@/components/video/VideoGrid";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { subscriptions } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

const RECENT_LIMIT = 24;
const SUBS_LIMIT = 12;
const TRENDING_LIMIT = 12;

// /home is the landing surface for signed-in viewers, but anonymous viewers
// also reach it from /; /'s redirect to /home only fires for authenticated
// users, so we keep the auth check here and bounce to /login if missing.
const HomePage = async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        redirect("/login");
    }

    // Subscriptions feed: most-recent public ready videos from channels the
    // viewer subscribes to. Falls back to "Recently uploaded" globally when
    // the viewer has no subscriptions yet.
    const subRows = await db
        .select({ channelId: subscriptions.channelId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, session.user.id));
    const subChannelIds = subRows.map((r) => r.channelId);

    const subFeed = subChannelIds.length
        ? await db
              .select({ video: videos, channel: channels })
              .from(videos)
              .innerJoin(channels, eq(videos.channelId, channels.id))
              .where(
                  and(
                      inArray(videos.channelId, subChannelIds),
                      eq(videos.privacy, "public"),
                      eq(videos.status, "ready"),
                  ),
              )
              .orderBy(desc(videos.publishedAt))
              .limit(SUBS_LIMIT)
        : [];

    const [recent, trending] = await Promise.all([
        db
            .select({ video: videos, channel: channels })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(and(eq(videos.privacy, "public"), eq(videos.status, "ready")))
            .orderBy(desc(videos.publishedAt))
            .limit(RECENT_LIMIT),
        // HN-style gravity decay so freshly uploaded videos with strong
        // viewership rank above older videos with similar totals.
        db
            .select({ video: videos, channel: channels })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(and(eq(videos.privacy, "public"), eq(videos.status, "ready")))
            .orderBy(
                sql`(videos.view_count::float / power(extract(epoch from now() - coalesce(videos.published_at, videos.created_at)) / 3600.0 + 2.0, 1.5)) DESC`,
                desc(videos.publishedAt),
            )
            .limit(TRENDING_LIMIT),
    ]);

    return (
        <AppShell>
            {/* Full-width grid: drops the centred container so an ultra-wide
                monitor uses every column the breakpoint ladder allows. The
                rail offset is handled by AppShell; we only add a small px
                gutter so cards do not touch the right edge. */}
            <div className="space-y-12 px-4 py-8 md:px-6 lg:px-8">
                {subFeed.length > 0 ? (
                    <section className="space-y-4">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-xl font-semibold tracking-tight">From your subscriptions</h2>
                            <a href="/subscriptions" className="text-sm text-muted-foreground hover:text-foreground">
                                See all
                            </a>
                        </div>
                        <VideoGrid
                            videos={subFeed.map(({ video, channel }) => ({
                                id: video.id,
                                title: video.title,
                                thumbnailPath: video.thumbnailPath,
                                durationSec: video.durationSec,
                                viewCount: video.viewCount,
                                publishedAt: video.publishedAt,
                                channel: { name: channel.name, handle: channel.handle },
                            }))}
                        />
                    </section>
                ) : null}

                {trending.length > 0 ? (
                    <section className="space-y-4">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-xl font-semibold tracking-tight">Trending</h2>
                        </div>
                        <VideoGrid
                            videos={trending.map(({ video, channel }) => ({
                                id: video.id,
                                title: video.title,
                                thumbnailPath: video.thumbnailPath,
                                durationSec: video.durationSec,
                                viewCount: video.viewCount,
                                publishedAt: video.publishedAt,
                                channel: { name: channel.name, handle: channel.handle },
                            }))}
                        />
                    </section>
                ) : null}

                <section className="space-y-4">
                    <div className="flex items-baseline justify-between">
                        <h2 className="text-xl font-semibold tracking-tight">Recently uploaded</h2>
                    </div>
                    <VideoGrid
                        videos={recent.map(({ video, channel }) => ({
                            id: video.id,
                            title: video.title,
                            thumbnailPath: video.thumbnailPath,
                            durationSec: video.durationSec,
                            viewCount: video.viewCount,
                            publishedAt: video.publishedAt,
                            channel: { name: channel.name, handle: channel.handle },
                        }))}
                        emptySlot={
                            <div className="rounded-2xl border border-border bg-card/40 p-10 text-center">
                                <p className="text-base font-medium">No videos yet.</p>
                                <p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground">
                                    Head to{" "}
                                    <a href="/studio" className="text-foreground underline-offset-4 hover:underline">
                                        Studio
                                    </a>{" "}
                                    to create a channel and upload your first video.
                                </p>
                            </div>
                        }
                    />
                </section>
            </div>
        </AppShell>
    );
};

export default HomePage;
