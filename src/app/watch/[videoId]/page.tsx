import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TRPCError } from "@trpc/server";

import { trpc } from "@/lib/trpc/server";
import AppShell from "@/components/shell/AppShell";
import { Player } from "@/components/player/Player";
import { Description } from "@/components/watch/Description";
import { DocumentTitle } from "@/components/watch/DocumentTitle";
import { UpNextSidebar } from "@/components/watch/UpNextSidebar";
import { CommentTree } from "@/components/comments/CommentTree";
import { ShareButton } from "@/components/watch/ShareButton";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { AddToWatchLaterChip } from "@/components/social/AddToWatchLaterChip";
import { TagChipRow } from "@/components/video/TagChip";
import { formatCount, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface WatchPageProps {
    params: Promise<{ videoId: string }>;
    searchParams: Promise<{ slug?: string }>;
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
    const { slug } = await searchParams;

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

    const publishedAtStr = video.publishedAt
        ? formatRelativeTime(video.publishedAt)
        : null;

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
                        {/* Player */}
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
                            />
                        </div>

                        {/* Video header */}
                        <div className="mt-4 space-y-3">
                            <h1 className="text-xl font-semibold leading-snug text-foreground">{video.title}</h1>

                            {video.tags.length > 0 && (
                                <TagChipRow tags={video.tags} />
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-3">
                                {/* Channel + stats */}
                                <div className="flex items-center gap-3">
                                    {/* Channel avatar */}
                                    <a
                                        href={`/c/${channel.handle}`}
                                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary ring-1 ring-border/50 hover:ring-border transition-all"
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
                                            className="block text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
                                        >
                                            {channel.name}
                                        </a>
                                        <p className="text-xs text-muted-foreground">@{channel.handle}</p>
                                    </div>

                                    {/* Subscribe button — B2 will wire real logic; placeholder for now */}
                                    <button
                                        className="ml-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label={isSubscribed ? "Subscribed" : "Subscribe"}
                                    >
                                        {isSubscribed ? "Subscribed" : "Subscribe"}
                                    </button>
                                </div>

                                {/* Action buttons (like / share / save) — social router (B2/M6) wires the real mutations */}
                                <div className="flex items-center gap-2">
                                    <ActionGroup>
                                        <ActionButton aria-label={isLikedByMe === "like" ? "Unlike" : "Like"}>
                                            <ThumbUpIcon active={isLikedByMe === "like"} />
                                            <span>{formatCount(video.likeCount)}</span>
                                        </ActionButton>
                                        <Divider />
                                        <ActionButton aria-label={isLikedByMe === "dislike" ? "Remove dislike" : "Dislike"}>
                                            <ThumbDownIcon active={isLikedByMe === "dislike"} />
                                        </ActionButton>
                                    </ActionGroup>

                                    <ActionGroup>
                                        <ShareButton
                                            videoId={video.id}
                                            slug={video.unlistedSlug ?? undefined}
                                            isPrivate={video.privacy === "private"}
                                        />
                                    </ActionGroup>

                                    <AddToWatchLaterChip videoId={video.id} />
                                    <AddToPlaylistButton videoId={video.id} />
                                </div>
                            </div>

                            {/* View count + date */}
                            <p className="text-sm text-muted-foreground">
                                {formatCount(video.viewCount)} views
                                {publishedAtStr && (
                                    <>
                                        {" "}
                                        <span aria-hidden="true">&middot;</span>
                                        {" "}
                                        {publishedAtStr}
                                    </>
                                )}
                            </p>
                        </div>

                        {/* Description */}
                        <div className="mt-4 rounded-xl bg-secondary/30 p-4">
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
                    <aside
                        className="w-full lg:w-[var(--watch-sidebar-w,360px)] lg:flex-shrink-0"
                        aria-label="Up Next"
                    >
                        <UpNextSidebar videos={sidebarVideos} />
                    </aside>
                </div>
            </div>
        </AppShell>
    );
}

// ---- Helper components used in the watch page layout ----

const ActionGroup = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center overflow-hidden rounded-full bg-secondary/60 hover:bg-secondary/80 transition-colors">
        {children}
    </div>
);

const ActionButton = ({
    children,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
        {...props}
        className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground/80",
            "hover:text-foreground hover:bg-white/5 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
        )}
    >
        {children}
    </button>
);

const Divider = () => <div className="h-5 w-px bg-border/60" />;

const ThumbUpIcon = ({ active }: { active: boolean }) => (
    <svg
        viewBox="0 0 24 24"
        className={cn("h-4 w-4", active ? "fill-foreground" : "fill-none stroke-current")}
        strokeWidth={1.8}
        aria-hidden="true"
    >
        <path d="M7 22V11L12 2l.85.35q.425.175.725.625t.3 1.025L12.65 9H19q.8 0 1.4.6t.6 1.4v2q0 .2-.05.45t-.1.45l-3 7.05q-.25.55-.85.925T15.7 22H7zm0-2h8.7l3-7v-2h-8.15l1.35-6.45L7 9.5V20zm-2 0V11H2v9h3z" />
    </svg>
);

const ThumbDownIcon = ({ active }: { active: boolean }) => (
    <svg
        viewBox="0 0 24 24"
        className={cn("h-4 w-4 scale-y-[-1]", active ? "fill-foreground" : "fill-none stroke-current")}
        strokeWidth={1.8}
        aria-hidden="true"
    >
        <path d="M7 22V11L12 2l.85.35q.425.175.725.625t.3 1.025L12.65 9H19q.8 0 1.4.6t.6 1.4v2q0 .2-.05.45t-.1.45l-3 7.05q-.25.55-.85.925T15.7 22H7zm0-2h8.7l3-7v-2h-8.15l1.35-6.45L7 9.5V20zm-2 0V11H2v9h3z" />
    </svg>
);
