import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { subscriptions } from "@/server/db/schema/social";
import { trpc } from "@/lib/trpc/server";
import AppShell from "@/components/shell/AppShell";
import { Player } from "@/components/player/Player";
import { Description } from "@/components/watch/Description";
import { DocumentTitle } from "@/components/watch/DocumentTitle";
import { UpNextSidebar } from "@/components/watch/UpNextSidebar";
import { WatchLayout } from "@/components/watch/WatchLayout";
import { CommentTree } from "@/components/comments/CommentTree";
import { ActionRow } from "@/components/watch/ActionRow";
import { TagChipRow } from "@/components/video/TagChip";
import { looksLikeUuid } from "@/lib/slug";
import { parseTimestamp } from "@/lib/timestamp";
import { formatCount, formatRelativeTime } from "@/lib/utils";

interface WatchPageProps {
    params: Promise<{ videoId: string }>;
    searchParams: Promise<{ slug?: string; t?: string }>;
}

export async function generateMetadata({ params, searchParams }: WatchPageProps): Promise<Metadata> {
    const { videoId } = await params;
    const { slug } = await searchParams;

    try {
        const data = await trpc.video.byId({ id: videoId, slug });
        return {
            title: data.video.title,
            description: data.video.description.slice(0, 160),
        };
    } catch {
        return { title: "Video not found" };
    }
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
    const { videoId } = await params;
    const sp = await searchParams;
    const { slug, t } = sp;

    let data: Awaited<ReturnType<typeof trpc.video.byId>>;
    try {
        data = await trpc.video.byId({ id: videoId, slug });
    } catch (err) {
        if (err instanceof TRPCError && (err.code === "NOT_FOUND" || err.code === "UNAUTHORIZED")) {
            notFound();
        }
        notFound();
    }

    const { video, channel, variants, captions, chapters, isLikedByMe, isSubscribed, signedToken } = data;

    // Subscriber count for the channel chip on this watch page. Fetched
    // here rather than threaded through video.byId so the procedure shape
    // stays focused; the cost is one cheap aggregate per render.
    const subscriberCountRows = await db
        .select({ value: count() })
        .from(subscriptions)
        .where(eq(subscriptions.channelId, channel.id))
        .catch(() => []);
    const subscriberCount = subscriberCountRows[0]?.value ?? 0;

    // Canonicalise: if the URL still uses the internal UUID, 308-redirect to
    // the short publicId form. Preserve the rest of the query string (slug,
    // ?t=, etc.) so deep links keep working.
    if (looksLikeUuid(videoId) && video.publicId && video.publicId !== videoId) {
        const qs = new URLSearchParams();
        if (slug) qs.set("slug", slug);
        if (t) qs.set("t", t);
        const tail = qs.toString();
        permanentRedirect(`/watch/${video.publicId}${tail ? `?${tail}` : ""}`);
    }

    const startSec = parseTimestamp(t) ?? undefined;

    // Fetch the autoplay-next video and the mixed-source recommendations list
    // for the sidebar in parallel. Three sources for "what plays next?":
    //   1. The caller's queue head, if any (peek; auto-advance pops it).
    //   2. The next public+ready video in the same channel.
    //   3. The recommendations rail.
    // Anonymous viewers get null from queue.peek (the procedure is protected;
    // we swallow the error so the watch page renders for them).
    const [queueHead, nextVideo, recommendations] = await Promise.all([
        trpc.playlist.queue.peek().catch(() => null),
        trpc.video.nextInChannel({ videoId: video.id }).catch(() => null),
        trpc.video.recommendations({ videoId: video.id, limit: 14 }).catch(() => []),
    ]);

    // The queue head wins over the channel-next fallback. We also tag the
    // "source" so the player knows whether to pop the queue when it advances.
    const playerNext: {
        id: string;
        title: string;
        thumbnailPath: string | null;
        channel: { name: string; handle: string };
        durationSec: number | null;
        source: "queue" | "channel";
    } | null = queueHead
        ? {
              id: queueHead.video.id,
              title: queueHead.video.title,
              thumbnailPath: queueHead.video.thumbnailPath,
              channel: queueHead.channel,
              durationSec: queueHead.video.durationSec,
              source: "queue",
          }
        : nextVideo
          ? {
                id: nextVideo.id,
                title: nextVideo.title,
                thumbnailPath: nextVideo.thumbnailPath,
                channel: nextVideo.channel,
                durationSec: nextVideo.durationSec,
                source: "channel",
            }
          : null;

    // Sidebar list — recommendations already exclude the current video, drafts,
    // private and non-ready videos. We additionally drop any video that's the
    // queue head so it doesn't appear twice (once with the "Up next" pill, once
    // as a regular recommendation).
    const sidebarVideos = recommendations
        .filter((v) => !queueHead || v.id !== queueHead.video.id)
        .map((v) => ({
            id: v.id,
            title: v.title,
            thumbnailPath: v.thumbnailPath,
            durationSec: v.durationSec,
            viewCount: v.viewCount,
            publishedAt: v.publishedAt,
            channel: v.channel,
        }));

    // Prepend the queue head so the sidebar leads with it. We mark it explicitly
    // as queued so the sidebar can render an "Up next" pill (vs the default
    // "Up Next" header treatment which is also applied to the first card).
    const queueHeadCard = queueHead
        ? {
              id: queueHead.video.id,
              title: queueHead.video.title,
              thumbnailPath: queueHead.video.thumbnailPath,
              durationSec: queueHead.video.durationSec,
              viewCount: queueHead.video.viewCount,
              publishedAt: queueHead.video.publishedAt,
              channel: queueHead.channel,
              isQueued: true as const,
          }
        : null;

    const publishedAtStr = video.publishedAt ? formatRelativeTime(video.publishedAt) : null;

    return (
        <AppShell hideSidebar>
            {/* Update browser tab title to video title while on the watch page. */}
            <DocumentTitle videoTitle={video.title} title="cassette" />

            {/* theatre-mode wrapper: CSS hides the rail + right column when data-theater="true" */}
            <div
                id="watch-page"
                data-theater="false"
                style={{
                    // CSS custom properties used by theatre-mode styles below.
                    ["--watch-sidebar-w" as string]: "360px",
                }}
            >
                <WatchLayout
                    sidebar={
                        <UpNextSidebar videos={queueHeadCard ? [queueHeadCard, ...sidebarVideos] : sidebarVideos} />
                    }
                    main={
                        <>
                            {/* Player.  `autoplay` requests playback on load —
                                Vidstack will start muted on browsers that block
                                unmuted autoplay; the in-player chrome surfaces a
                                "tap to unmute" affordance.  `startSec` honours
                                the ?t= deep-link parameter. */}
                            <div className="watch-player w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
                                <Player
                                    video={video}
                                    captions={captions}
                                    chapters={chapters}
                                    variants={variants}
                                    signedToken={signedToken}
                                    queueNext={playerNext}
                                    channel={channel}
                                    autoplay
                                    muted
                                    startSec={startSec}
                                />
                            </div>

                            {/* Video header */}
                            <div className="mt-4 space-y-3">
                                <h1 className="text-xl font-semibold leading-snug text-foreground">{video.title}</h1>

                                {video.tags.length > 0 && <TagChipRow tags={video.tags} />}

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    {/* Channel + stats */}
                                    <div className="flex items-center gap-3">
                                        {/* Channel avatar — channels keep their explicit avatar
                                        upload pipeline; if not set we fall back to the
                                        first-letter chip (no Gravatar lookup, the channel
                                        is not a user account). */}
                                        <a
                                            href={`/channel/${channel.handle}`}
                                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-1 ring-border/50 transition-all hover:ring-border"
                                            aria-label={`${channel.name}'s channel`}
                                        >
                                            {channel.avatarPath ? (
                                                <Image
                                                    src={`/api/channel/${channel.id}/asset/avatar`}
                                                    alt={channel.name}
                                                    width={40}
                                                    height={40}
                                                    unoptimized
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-sm font-semibold text-foreground/80">
                                                    {channel.name[0]?.toUpperCase() ?? "C"}
                                                </span>
                                            )}
                                        </a>

                                        <div>
                                            <a
                                                href={`/@${channel.handle}`}
                                                className="block text-sm font-semibold text-foreground transition-colors hover:text-foreground/80"
                                            >
                                                {channel.name}
                                            </a>
                                            <p className="text-xs text-muted-foreground">
                                                {formatCount(subscriberCount)}
                                                {" subscriber"}
                                                {subscriberCount === 1 ? "" : "s"}
                                            </p>
                                        </div>

                                        {/* Subscribe button — B2 will wire real logic; placeholder for now */}
                                        <button
                                            className="ml-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            aria-label={isSubscribed ? "Subscribed" : "Subscribe"}
                                        >
                                            {isSubscribed ? "Subscribed" : "Subscribe"}
                                        </button>
                                    </div>

                                    {/* Action row: Like | Dislike | Watch Later | … */}
                                    <ActionRow
                                        videoId={video.id}
                                        slug={video.unlistedSlug ?? undefined}
                                        isPrivate={video.privacy === "private"}
                                        likeCount={video.likeCount}
                                        dislikeCount={video.dislikeCount ?? 0}
                                        isLikedByMe={isLikedByMe}
                                        captions={captions.map((c) => ({
                                            lang: c.lang,
                                            label: c.label,
                                            isDefault: c.isDefault,
                                        }))}
                                        signedToken={signedToken}
                                    />
                                </div>
                            </div>

                            {/* Description card — views/date now sit at the top so
                            they have proper container context. */}
                            <div className="mt-4 rounded-xl bg-secondary/40 p-4 ring-1 ring-border/40">
                                <p className="mb-2 text-sm font-medium text-foreground">
                                    {formatCount(video.viewCount)} views
                                    {publishedAtStr && (
                                        <>
                                            {" "}
                                            <span aria-hidden="true">&middot;</span> {publishedAtStr}
                                        </>
                                    )}
                                </p>
                                <Description text={video.description} />
                            </div>

                            {/* Threaded comments. CommentTree handles its own
                                fetch and pagination via tRPC; signed-out viewers
                                see read-only mode with a "Sign in to comment" CTA. */}
                            <div className="mt-6" id="comments">
                                <CommentTree videoId={video.id} />
                            </div>
                        </>
                    }
                />
            </div>
        </AppShell>
    );
}

// Helper components for the action row + thumbs icons live alongside ActionRow
// in src/components/watch/ActionRow.tsx.
