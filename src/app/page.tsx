import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { unstable_cache } from "next/cache";

import { CassetteWordmark } from "@/components/branding/CassetteWordmark";
import { RandomVideoButton } from "@/components/home/RandomVideoButton";
import { TrendingTagsRow } from "@/components/home/TrendingTagsRow";
import AppShell from "@/components/shell/AppShell";
import { VideoGrid } from "@/components/video/VideoGrid";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { subscriptions } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";

const RECENT_LIMIT = 24;
const SUBS_LIMIT = 12;
const TRENDING_LIMIT = 12;
const TAG_LIMIT = 12;

// Cache the trending-tags aggregate for 5 minutes — the home page renders it
// on every request and the underlying query is an UNNEST + GROUP BY across
// the entire videos table.
const getTrendingTags = unstable_cache(
    async () => {
        const rows = await db.execute<{ tag: string; uses: number }>(sql`
            SELECT tag, count(*)::int AS uses
            FROM videos v, unnest(v.tags) AS tag
            WHERE v.privacy = 'public'
              AND v.status = 'ready'
              AND v.is_draft = false
            GROUP BY tag
            ORDER BY uses DESC, tag ASC
            LIMIT ${TAG_LIMIT}
        `);
        return rows.map((r) => ({ tag: r.tag, uses: Number(r.uses) }));
    },
    ["home:trending-tags"],
    { revalidate: 300 },
);

// Root surface. Signed-in viewers get the home shell (subscriptions + trending
// + recent); anonymous viewers see the marketing hero with sign-in CTAs.
const HomePage = async () => {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
                <div className="space-y-6">
                    <div className="flex justify-center">
                        <CassetteWordmark className="scale-150 text-foreground" />
                    </div>
                    <div className="space-y-3">
                        <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-6xl">
                            Your videos. Your hardware. Your rules.
                        </h1>
                        <p className="mx-auto max-w-xl text-balance text-base text-muted-foreground">
                            A self-hosted personal video platform. Upload via a simple HTTP API, watch back as adaptive
                            HLS, and keep your library on disc where you can see it.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Link
                        href="/login"
                        className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        Sign in
                    </Link>
                    <Link
                        href="/register"
                        className="rounded-full border border-border bg-secondary/40 px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        Create an account
                    </Link>
                </div>

                <footer className="absolute bottom-6 text-xs text-muted-foreground">
                    Built with Next.js, Drizzle, Better-Auth, and Vidstack.
                </footer>
            </main>
        );
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
                      eq(videos.isDraft, false),
                  ),
              )
              .orderBy(desc(videos.publishedAt))
              .limit(SUBS_LIMIT)
        : [];

    const [recent, trending, trendingTags] = await Promise.all([
        db
            .select({ video: videos, channel: channels })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(and(eq(videos.privacy, "public"), eq(videos.status, "ready"), eq(videos.isDraft, false)))
            .orderBy(desc(videos.publishedAt))
            .limit(RECENT_LIMIT),
        db
            .select({ video: videos, channel: channels })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(and(eq(videos.privacy, "public"), eq(videos.status, "ready"), eq(videos.isDraft, false)))
            .orderBy(
                sql`(videos.view_count::float / power(extract(epoch from now() - coalesce(videos.published_at, videos.created_at)) / 3600.0 + 2.0, 1.5)) DESC`,
                desc(videos.publishedAt),
            )
            .limit(TRENDING_LIMIT),
        getTrendingTags(),
    ]);

    return (
        <AppShell>
            <div className="space-y-12 px-4 py-8 md:px-6 lg:px-8">
                <div className="flex items-center justify-between gap-3">
                    {trendingTags.length > 0 ? (
                        <TrendingTagsRow tags={trendingTags} className="flex-1" />
                    ) : (
                        <div className="flex-1" />
                    )}
                    <RandomVideoButton />
                </div>

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
                                publicId: video.publicId,
                                unlistedSlug: video.unlistedSlug,
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
                                publicId: video.publicId,
                                unlistedSlug: video.unlistedSlug,
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
                            publicId: video.publicId,
                            unlistedSlug: video.unlistedSlug,
                            thumbnailPath: video.thumbnailPath,
                            durationSec: video.durationSec,
                            viewCount: video.viewCount,
                            publishedAt: video.publishedAt,
                            channel: { name: channel.name, handle: channel.handle },
                        }))}
                        emptySlot={
                            <div className="rounded-2xl border border-border bg-card/40 p-10 text-center">
                                <p className="text-base font-medium">No videos yet.</p>
                                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
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
