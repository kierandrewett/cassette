import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { TRPCError } from "@trpc/server";

import { trpc } from "@/lib/trpc/server";
import AppShell from "@/components/shell/AppShell";
import { Player } from "@/components/player/Player";
import { Description } from "@/components/watch/Description";
import { DocumentTitle } from "@/components/watch/DocumentTitle";
import { UpNextSidebar } from "@/components/watch/UpNextSidebar";
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

    // Fetch the autoplay-next video (queue integration lands in M7; this is the channel fallback).
    let nextVideo: Awaited<ReturnType<typeof trpc.video.nextInChannel>> = null;
    try {
        nextVideo = await trpc.video.nextInChannel({ videoId: video.id });
    } catch {
        // Non-critical — autoplay fallback missing is acceptable.
    }

    // Build the sidebar list: next video + a few more from the channel.
    // For now, just use the single nextInChannel result as the sidebar head.
    const sidebarVideos = nextVideo
        ? [
              {
                  id: nextVideo.id,
                  title: nextVideo.title,
                  thumbnailPath: nextVideo.thumbnailPath,
                  durationSec: nextVideo.durationSec,
                  viewCount: nextVideo.viewCount,
                  publishedAt: nextVideo.publishedAt,
                  channel: nextVideo.channel,
              },
          ]
        : [];

    const publishedAtStr = video.publishedAt ? formatRelativeTime(video.publishedAt) : null;

    return (
        <AppShell>
            {/* Update browser tab title to video title while on the watch page. */}
            <DocumentTitle videoTitle={video.title} title="cassette" />

            {/* theatre-mode wrapper: CSS hides the rail + right column when data-theater="true" */}
            <div
                id="watch-page"
                data-theater="false"
                className="mx-auto w-full max-w-[1600px] px-4 py-4 md:px-6 lg:px-8"
                style={{
                    // CSS custom properties used by theatre-mode styles below.
                    ["--watch-sidebar-w" as string]: "360px",
                }}
            >
                <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
                    {/* ---- Left column ---- */}
                    <div className="min-w-0 flex-1">
                        {/* Player.  `autoplay` requests playback on load —
                            Vidstack will start muted on browsers that block
                            unmuted autoplay; the in-player chrome surfaces a
                            "tap to unmute" affordance.  `startSec` honours
                            the ?t= deep-link parameter. */}
                        <div className="w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
                            <Player
                                video={video}
                                captions={captions}
                                chapters={chapters}
                                variants={variants}
                                signedToken={signedToken}
                                queueNext={
                                    nextVideo
                                        ? {
                                              id: nextVideo.id,
                                              title: nextVideo.title,
                                              thumbnailPath: nextVideo.thumbnailPath,
                                              channel: nextVideo.channel,
                                              durationSec: nextVideo.durationSec,
                                          }
                                        : null
                                }
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
                                        href={`/c/${channel.handle}`}
                                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-1 ring-border/50 transition-all hover:ring-border"
                                        aria-label={`${channel.name}'s channel`}
                                    >
                                        {channel.avatarPath ? (
                                            <Image
                                                src={`/api/hls/${channel.handle}/avatar`}
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
                                            href={`/c/${channel.handle}`}
                                            className="block text-sm font-semibold text-foreground transition-colors hover:text-foreground/80"
                                        >
                                            {channel.name}
                                        </a>
                                        <p className="text-xs text-muted-foreground">@{channel.handle}</p>
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
                    </div>

                    {/* ---- Right column (Up Next sidebar) ---- */}
                    <aside className="w-full lg:w-[var(--watch-sidebar-w,360px)] lg:flex-shrink-0" aria-label="Up Next">
                        <UpNextSidebar videos={sidebarVideos} />
                    </aside>
                </div>
            </div>
        </AppShell>
    );
}

// Helper components for the action row + thumbs icons live alongside ActionRow
// in src/components/watch/ActionRow.tsx.
