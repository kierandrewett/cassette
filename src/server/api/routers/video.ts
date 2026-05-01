import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { signToken } from "@/lib/hls/sign";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { channelMembers } from "@/server/db/schema/channels";
import { transcodeJobs } from "@/server/db/schema/jobs";
import { videoLikes } from "@/server/db/schema/social";
import { subscriptions } from "@/server/db/schema/social";
import { channels } from "@/server/db/schema/channels";
import {
    videoCaptions,
    videoChapters,
    videos,
    videoVariants,
} from "@/server/db/schema/videos";
import { viewSessions, watchHistory, watchProgress } from "@/server/db/schema/history";

// Constant-time string compare to prevent timing attacks on unlisted slugs.
const safeEqual = (a: string, b: string): boolean => {
    try {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ab.length !== bb.length) {
            // Different lengths — always false but still spend time on a dummy compare.
            timingSafeEqual(Buffer.alloc(ab.length), Buffer.alloc(ab.length));
            return false;
        }
        return timingSafeEqual(ab, bb);
    } catch {
        return false;
    }
};

export const videoRouter = createTRPCRouter({
    // ---------------------------------------------------------------------------
    // uploadStatus — poll transcode state from studio
    // ---------------------------------------------------------------------------
    uploadStatus: protectedProcedure
        .input(z.object({ videoId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Load the video to determine its channel.
            const videoRows = await ctx.db
                .select({ channelId: videos.channelId })
                .from(videos)
                .where(eq(videos.id, input.videoId))
                .limit(1);

            const video = videoRows[0];
            if (!video) {
                return null;
            }

            // Verify the caller is a member of the channel that owns the video.
            const memberRows = await ctx.db
                .select({ role: channelMembers.role })
                .from(channelMembers)
                .where(
                    and(
                        eq(channelMembers.channelId, video.channelId),
                        eq(channelMembers.userId, ctx.user.id),
                    ),
                )
                .limit(1);

            if (!memberRows[0]) {
                return null;
            }

            // Return the latest transcode_jobs row for this video.
            const jobRows = await ctx.db
                .select({
                    state: transcodeJobs.state,
                    progress: transcodeJobs.progress,
                    step: transcodeJobs.step,
                    message: transcodeJobs.message,
                    finishedAt: transcodeJobs.finishedAt,
                })
                .from(transcodeJobs)
                .where(eq(transcodeJobs.videoId, input.videoId))
                .orderBy(desc(transcodeJobs.createdAt))
                .limit(1);

            return jobRows[0] ?? null;
        }),

    // ---------------------------------------------------------------------------
    // byId — load a video with all relations; enforces privacy gate
    // ---------------------------------------------------------------------------
    byId: publicProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                slug: z.string().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            // Load video + channel in one query.
            const rows = await ctx.db
                .select({
                    video: videos,
                    channel: {
                        id: channels.id,
                        handle: channels.handle,
                        name: channels.name,
                        avatarPath: channels.avatarPath,
                        ownerId: channels.ownerId,
                    },
                })
                .from(videos)
                .innerJoin(channels, eq(videos.channelId, channels.id))
                .where(eq(videos.id, input.id))
                .limit(1);

            const row = rows[0];

            // Return NOT_FOUND for non-existent videos and for non-ready private videos
            // (don't leak existence of private content).
            if (!row) {
                throw new TRPCError({ code: "NOT_FOUND" });
            }

            const { video, channel } = row;

            // Privacy gate.
            if (video.privacy === "unlisted") {
                // Unlisted: require slug to match the stored unlistedSlug.
                if (!input.slug || !video.unlistedSlug || !safeEqual(input.slug, video.unlistedSlug)) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
            } else if (video.privacy === "private") {
                // Private: require authenticated session AND uploader OR channel member.
                if (!ctx.user) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
                // Check ownership: uploader or channel member.
                const isUploader = video.uploaderId === ctx.user.id;
                let isMember = isUploader;
                if (!isUploader) {
                    const memberRows = await ctx.db
                        .select({ role: channelMembers.role })
                        .from(channelMembers)
                        .where(
                            and(
                                eq(channelMembers.channelId, video.channelId),
                                eq(channelMembers.userId, ctx.user.id),
                            ),
                        )
                        .limit(1);
                    isMember = !!memberRows[0];
                }
                if (!isMember) {
                    // Don't reveal existence.
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
            }

            // Load variants, captions, chapters in parallel.
            const [variantRows, captionRows, chapterRows] = await Promise.all([
                ctx.db
                    .select()
                    .from(videoVariants)
                    .where(eq(videoVariants.videoId, video.id)),
                ctx.db
                    .select()
                    .from(videoCaptions)
                    .where(eq(videoCaptions.videoId, video.id)),
                ctx.db
                    .select()
                    .from(videoChapters)
                    .where(eq(videoChapters.videoId, video.id))
                    .orderBy(videoChapters.startSec),
            ]);

            // Like / subscription status if authenticated.
            let isLikedByMe: "like" | "dislike" | null = null;
            let isSubscribed = false;

            if (ctx.user) {
                const [likeRows, subRows] = await Promise.all([
                    ctx.db
                        .select({ kind: videoLikes.kind })
                        .from(videoLikes)
                        .where(
                            and(
                                eq(videoLikes.videoId, video.id),
                                eq(videoLikes.userId, ctx.user.id),
                            ),
                        )
                        .limit(1),
                    ctx.db
                        .select({ userId: subscriptions.userId })
                        .from(subscriptions)
                        .where(
                            and(
                                eq(subscriptions.channelId, video.channelId),
                                eq(subscriptions.userId, ctx.user.id),
                            ),
                        )
                        .limit(1),
                ]);
                isLikedByMe = likeRows[0]?.kind ?? null;
                isSubscribed = !!subRows[0];
            }

            // Signed token: only for private (unlisted viewers just use the slug in the URL).
            let signedToken: string | null = null;
            if (video.privacy === "private" && ctx.user) {
                signedToken = signToken({ videoId: video.id, userId: ctx.user.id, ttlSec: 4 * 3600 });
            }

            return {
                video,
                channel,
                variants: variantRows,
                captions: captionRows,
                chapters: chapterRows,
                isLikedByMe,
                isSubscribed,
                signedToken,
            };
        }),

    // ---------------------------------------------------------------------------
    // recordProgress — upsert watch progress (protected, best-effort)
    // ---------------------------------------------------------------------------
    recordProgress: protectedProcedure
        .input(
            z.object({
                videoId: z.string().uuid(),
                positionSec: z.number().int().nonnegative(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            try {
                // Look up durationSec from the video row.
                const videoRows = await ctx.db
                    .select({ durationSec: videos.durationSec })
                    .from(videos)
                    .where(eq(videos.id, input.videoId))
                    .limit(1);

                const durationSec = videoRows[0]?.durationSec ?? 0;
                const completed = durationSec > 0 && input.positionSec >= durationSec - 5;

                // Upsert watchProgress (composite PK userId + videoId).
                await ctx.db
                    .insert(watchProgress)
                    .values({
                        userId: ctx.user.id,
                        videoId: input.videoId,
                        positionSec: input.positionSec,
                        durationSec,
                        completed,
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: [watchProgress.userId, watchProgress.videoId],
                        set: {
                            positionSec: input.positionSec,
                            durationSec,
                            completed,
                            updatedAt: new Date(),
                        },
                    });

                // Append watch history row (tolerates duplicates per schema comment).
                await ctx.db.insert(watchHistory).values({
                    userId: ctx.user.id,
                    videoId: input.videoId,
                });
            } catch {
                // Best-effort — never crash the player.
            }

            return { ok: true };
        }),

    // ---------------------------------------------------------------------------
    // getProgress — read latest watch position
    // ---------------------------------------------------------------------------
    getProgress: protectedProcedure
        .input(z.object({ videoId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select({
                    positionSec: watchProgress.positionSec,
                    durationSec: watchProgress.durationSec,
                    completed: watchProgress.completed,
                    updatedAt: watchProgress.updatedAt,
                })
                .from(watchProgress)
                .where(
                    and(
                        eq(watchProgress.userId, ctx.user.id),
                        eq(watchProgress.videoId, input.videoId),
                    ),
                )
                .limit(1);

            return rows[0] ?? null;
        }),

    // ---------------------------------------------------------------------------
    // recordView — de-duped 30-min bucket view counting (public, best-effort)
    // ---------------------------------------------------------------------------
    recordView: publicProcedure
        .input(
            z.object({
                videoId: z.string().uuid(),
                sessionHash: z.string().min(1).max(128),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            try {
                const bucket = Math.floor(Date.now() / 1_800_000);

                // Use a transaction so the view_sessions insert and viewCount increment
                // are atomic. ON CONFLICT DO NOTHING prevents double-counts.
                await ctx.db.transaction(async (tx) => {
                    const result = await tx
                        .insert(viewSessions)
                        .values({
                            videoId: input.videoId,
                            sessionHash: input.sessionHash,
                            bucket,
                            userId: ctx.user?.id ?? null,
                        })
                        .onConflictDoNothing({
                            target: [viewSessions.videoId, viewSessions.sessionHash, viewSessions.bucket],
                        })
                        .returning({ id: viewSessions.id });

                    // Only increment if the insert actually created a new row.
                    if (result.length > 0) {
                        await tx
                            .update(videos)
                            .set({ viewCount: sql`${videos.viewCount} + 1` })
                            .where(eq(videos.id, input.videoId));
                    }
                });
            } catch {
                // Best-effort — never crash the page render.
            }

            return { ok: true };
        }),

    // ---------------------------------------------------------------------------
    // nextInChannel — autoplay fallback: next public+ready video in same channel
    // ---------------------------------------------------------------------------
    nextInChannel: publicProcedure
        .input(z.object({ videoId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Load the channel for the current video.
            const videoRows = await ctx.db
                .select({ channelId: videos.channelId, publishedAt: videos.publishedAt })
                .from(videos)
                .where(eq(videos.id, input.videoId))
                .limit(1);

            const currentVideo = videoRows[0];
            if (!currentVideo) return null;

            // Find the next public + ready video in the same channel, ordered by publishedAt DESC.
            // "Next" means the most recently published video that is NOT the current one.
            // TODO (M7): when the queue system lands, use the queue instead of this fallback.
            const nextRows = await ctx.db
                .select({
                    id: videos.id,
                    title: videos.title,
                    thumbnailPath: videos.thumbnailPath,
                    durationSec: videos.durationSec,
                    viewCount: videos.viewCount,
                    publishedAt: videos.publishedAt,
                    channelId: videos.channelId,
                })
                .from(videos)
                .innerJoin(channels, eq(videos.channelId, channels.id))
                .where(
                    and(
                        eq(videos.channelId, currentVideo.channelId),
                        eq(videos.privacy, "public"),
                        eq(videos.status, "ready"),
                        ne(videos.id, input.videoId),
                        gt(videos.publishedAt, sql`'1970-01-01'::timestamptz`),
                    ),
                )
                .orderBy(desc(videos.publishedAt))
                .limit(1);

            if (!nextRows[0]) return null;

            // Also grab channel info for the card.
            const channelRows = await ctx.db
                .select({ handle: channels.handle, name: channels.name, avatarPath: channels.avatarPath })
                .from(channels)
                .where(eq(channels.id, nextRows[0].channelId))
                .limit(1);

            const channel = channelRows[0];
            if (!channel) return null;

            return { ...nextRows[0], channel };
        }),
});
