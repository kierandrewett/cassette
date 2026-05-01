import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Video01Icon, EyeIcon, UserMultipleIcon, HddIcon, UploadCircle01Icon, Comment01Icon } from "hugeicons-react";
import { and, count, desc, eq, isNull, sum } from "drizzle-orm";

import { StatCard } from "@/components/studio/StatCard";
import { StudioEmptyState } from "@/components/studio/StudioEmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc/server";
import { db } from "@/server/db/client";
import { videos } from "@/server/db/schema/videos";
import { comments, subscriptions } from "@/server/db/schema/social";
import { formatCount, formatRelativeTime } from "@/lib/utils";

type Props = {
    params: Promise<{ handle: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `@${handle} — Studio` };
};

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const STATUS_LABELS: Record<string, string> = {
    queued: "Queued",
    transcoding: "Transcoding",
    ready: "Ready",
    failed: "Failed",
};

const statusClass = (status: string): string => {
    switch (status) {
        case "ready":
            return "text-green-400 bg-green-500/10";
        case "failed":
            return "text-destructive bg-destructive/10";
        case "transcoding":
            return "text-yellow-400 bg-yellow-500/10";
        default:
            return "text-muted-foreground bg-muted";
    }
};

const StudioChannelOverviewPage = async ({ params }: Props) => {
    const { handle } = await params;

    let memberships: Awaited<ReturnType<typeof trpc.channel.listMine>>;
    try {
        memberships = await trpc.channel.listMine();
    } catch {
        redirect("/login");
    }

    const membership = memberships.find((c) => c.handle === handle.toLowerCase());
    if (!membership) {
        notFound();
    }

    // Fetch overview data in parallel: stats aggregates, last 5 uploads, recent
    // comments across the channel's videos, and disk usage. Each query is
    // best-effort; failures are swallowed and the affected card simply shows 0.
    const [videoStatsRow, subsRow, recentVideos, usage, recentComments] = await Promise.all([
        db
            .select({
                total: count(videos.id),
                totalViews: sum(videos.viewCount).mapWith(Number),
            })
            .from(videos)
            .where(eq(videos.channelId, membership.id))
            .then((r) => r[0] ?? { total: 0, totalViews: 0 }),
        db
            .select({ count: count() })
            .from(subscriptions)
            .where(eq(subscriptions.channelId, membership.id))
            .then((r) => r[0]?.count ?? 0),
        db.select().from(videos).where(eq(videos.channelId, membership.id)).orderBy(desc(videos.createdAt)).limit(5),
        trpc.channel.getUsage({ channelId: membership.id }).catch(() => null),
        db
            .select({
                id: comments.id,
                videoId: comments.videoId,
                body: comments.body,
                createdAt: comments.createdAt,
                videoTitle: videos.title,
            })
            .from(comments)
            .innerJoin(videos, eq(videos.id, comments.videoId))
            .where(and(eq(videos.channelId, membership.id), isNull(comments.deletedAt)))
            .orderBy(desc(comments.createdAt))
            .limit(5),
    ]);

    const totalVideos = Number(videoStatsRow.total ?? 0);
    const totalViews = Number(videoStatsRow.totalViews ?? 0);
    const subscribers = Number(subsRow ?? 0);

    const hasContent = recentVideos.length > 0;

    return (
        <>
            {/* Page header — sits below the sticky subnav and gives the surface
                a clear identity beyond just the channel chip. */}
            <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Channel dashboard</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    A quick look at your latest activity on{" "}
                    <span className="font-medium text-foreground">@{membership.handle}</span>.
                </p>
            </header>

            {/* Stat cards row */}
            <section aria-label="Channel statistics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Video01Icon} label="Videos" value={formatCount(totalVideos)} />
                <StatCard icon={EyeIcon} label="Total views" value={formatCount(totalViews)} />
                <StatCard icon={UserMultipleIcon} label="Subscribers" value={formatCount(subscribers)} />
                <StatCard
                    icon={HddIcon}
                    label="Disk usage"
                    value={usage ? formatBytes(usage.used) : "—"}
                    hint={usage?.quota ? `of ${formatBytes(usage.quota)}` : usage ? "no quota set" : undefined}
                />
            </section>

            {!hasContent ? (
                <div className="mt-8">
                    <StudioEmptyState
                        icon={UploadCircle01Icon}
                        title="Upload your first video"
                        description="Once your videos are uploaded and transcoded, you'll see views, comments, and recent uploads here."
                        cta={{ label: "Upload video", href: `/studio/channel/${handle}/upload` }}
                    />
                </div>
            ) : (
                <div className="mt-8 grid gap-6 lg:grid-cols-3">
                    {/* Recent uploads — spans 2 cols on large screens. */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base">Recent uploads</CardTitle>
                            <Link
                                href={`/studio/channel/${handle}/videos`}
                                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                            >
                                View all
                            </Link>
                        </CardHeader>
                        <CardContent>
                            <ul className="divide-y divide-border">
                                {recentVideos.map((video) => {
                                    const thumbUrl =
                                        video.status === "ready" ? `/api/hls/${video.id}/thumb/sprite.jpg` : null;
                                    return (
                                        <li
                                            key={video.id}
                                            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                                        >
                                            <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                                                {thumbUrl ? (
                                                    <Image
                                                        src={thumbUrl}
                                                        alt=""
                                                        fill
                                                        sizes="96px"
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                                        {video.status === "transcoding" ? "Transcoding" : "Processing"}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {video.title}
                                                </p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {formatRelativeTime(video.createdAt)} •{" "}
                                                    {formatCount(video.viewCount ?? 0)} view
                                                    {video.viewCount === 1 ? "" : "s"}
                                                </p>
                                            </div>
                                            <span
                                                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(video.status)}`}
                                            >
                                                {STATUS_LABELS[video.status] ?? video.status}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </CardContent>
                    </Card>

                    {/* Recent comments */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Recent comments</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {recentComments.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-6 text-center">
                                    <Comment01Icon size={20} strokeWidth={1.6} className="text-muted-foreground/70" />
                                    <p className="text-sm text-muted-foreground">No comments yet.</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {recentComments.map((c) => (
                                        <li key={c.id} className="space-y-1">
                                            <Link
                                                href={`/watch/${c.videoId}`}
                                                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                            >
                                                {c.videoTitle}
                                            </Link>
                                            <p className="line-clamp-2 text-sm text-foreground/90">{c.body}</p>
                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {formatRelativeTime(c.createdAt)}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </>
    );
};

export default StudioChannelOverviewPage;
