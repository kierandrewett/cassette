import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "@/env";
import { signToken } from "@/lib/hls/sign";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { channelMembers } from "@/server/db/schema/channels";
import { transcodeJobs } from "@/server/db/schema/jobs";
import { videoLikes } from "@/server/db/schema/social";
import { subscriptions } from "@/server/db/schema/social";
import { channels } from "@/server/db/schema/channels";
import { videoCaptions, videoChapters, videos, videoVariants } from "@/server/db/schema/videos";
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
    uploadStatus: protectedProcedure.input(z.object({ videoId: z.string().uuid() })).query(async ({ ctx, input }) => {
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
            .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, ctx.user.id)))
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
                // Accepts either the canonical UUID or the short publicId so
                // /watch/<short> and /watch/<uuid> both resolve to the same
                // video. The resolver picks the right column based on shape.
                id: z.string().min(1),
                slug: z.string().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { looksLikeUuid } = await import("@/lib/slug");
            const isUuid = looksLikeUuid(input.id);
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
                .where(isUuid ? eq(videos.id, input.id) : eq(videos.publicId, input.id))
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
                            and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, ctx.user.id)),
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
                ctx.db.select().from(videoVariants).where(eq(videoVariants.videoId, video.id)),
                ctx.db.select().from(videoCaptions).where(eq(videoCaptions.videoId, video.id)),
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
                        .where(and(eq(videoLikes.videoId, video.id), eq(videoLikes.userId, ctx.user.id)))
                        .limit(1),
                    ctx.db
                        .select({ userId: subscriptions.userId })
                        .from(subscriptions)
                        .where(and(eq(subscriptions.channelId, video.channelId), eq(subscriptions.userId, ctx.user.id)))
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
    getProgress: protectedProcedure.input(z.object({ videoId: z.string().uuid() })).query(async ({ ctx, input }) => {
        const rows = await ctx.db
            .select({
                positionSec: watchProgress.positionSec,
                durationSec: watchProgress.durationSec,
                completed: watchProgress.completed,
                updatedAt: watchProgress.updatedAt,
            })
            .from(watchProgress)
            .where(and(eq(watchProgress.userId, ctx.user.id), eq(watchProgress.videoId, input.videoId)))
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
    nextInChannel: publicProcedure.input(z.object({ videoId: z.string().uuid() })).query(async ({ ctx, input }) => {
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

    // ---------------------------------------------------------------------------
    // listForChannel — channel-scoped video list for the studio video table.
    // Returns ALL the channel's videos including unlisted/private/queued/failed.
    // Caller must be a member of the channel (any role).
    // ---------------------------------------------------------------------------
    listForChannel: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                limit: z.number().int().positive().max(100).default(50),
                cursor: z.string().uuid().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            // authz: caller must be a channel member
            const memberRows = await ctx.db
                .select({ role: channelMembers.role })
                .from(channelMembers)
                .where(and(eq(channelMembers.channelId, input.channelId), eq(channelMembers.userId, ctx.user.id)))
                .limit(1);
            if (!memberRows[0]) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this channel." });
            }

            const cursorRow = input.cursor
                ? await ctx.db
                      .select({ createdAt: videos.createdAt })
                      .from(videos)
                      .where(eq(videos.id, input.cursor))
                      .limit(1)
                : [];
            const cursorTs = cursorRow[0]?.createdAt;

            const rows = await ctx.db
                .select()
                .from(videos)
                .where(
                    and(
                        eq(videos.channelId, input.channelId),
                        cursorTs ? sql`${videos.createdAt} < ${cursorTs}` : undefined,
                    ),
                )
                .orderBy(desc(videos.createdAt))
                .limit(input.limit + 1);

            const hasMore = rows.length > input.limit;
            const items = hasMore ? rows.slice(0, input.limit) : rows;
            const last = items[items.length - 1];
            return {
                items,
                nextCursor: hasMore && last ? last.id : null,
            };
        }),

    // ---------------------------------------------------------------------------
    // updateMetadata — title/description/tags edits. Caller must be a channel member.
    // ---------------------------------------------------------------------------
    updateMetadata: protectedProcedure
        .input(
            z.object({
                videoId: z.string().uuid(),
                title: z.string().trim().min(1).max(200).optional(),
                description: z.string().trim().max(10_000).optional(),
                tags: z
                    .array(
                        z
                            .string()
                            .regex(/^[a-z0-9-]+$/)
                            .max(30),
                    )
                    .max(12)
                    .optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const videoRows = await ctx.db
                .select({ channelId: videos.channelId })
                .from(videos)
                .where(eq(videos.id, input.videoId))
                .limit(1);
            const video = videoRows[0];
            if (!video) throw new TRPCError({ code: "NOT_FOUND" });

            const memberRows = await ctx.db
                .select({ role: channelMembers.role })
                .from(channelMembers)
                .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, ctx.user.id)))
                .limit(1);
            if (!memberRows[0]) throw new TRPCError({ code: "FORBIDDEN" });

            const patch: Partial<typeof videos.$inferInsert> = { updatedAt: new Date() };
            if (input.title !== undefined) patch.title = input.title;
            if (input.description !== undefined) patch.description = input.description;
            if (input.tags !== undefined) patch.tags = input.tags;

            const [updated] = await ctx.db.update(videos).set(patch).where(eq(videos.id, input.videoId)).returning();
            return updated!;
        }),

    // ---------------------------------------------------------------------------
    // setPrivacy — public / unlisted / private. Mints a new unlistedSlug when
    // moving INTO unlisted; nulls it when moving away.
    // ---------------------------------------------------------------------------
    setPrivacy: protectedProcedure
        .input(
            z.object({
                videoId: z.string().uuid(),
                privacy: z.enum(["public", "unlisted", "private"]),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const videoRows = await ctx.db
                .select({ channelId: videos.channelId, currentPrivacy: videos.privacy })
                .from(videos)
                .where(eq(videos.id, input.videoId))
                .limit(1);
            const video = videoRows[0];
            if (!video) throw new TRPCError({ code: "NOT_FOUND" });

            const memberRows = await ctx.db
                .select({ role: channelMembers.role })
                .from(channelMembers)
                .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, ctx.user.id)))
                .limit(1);
            if (!memberRows[0]) throw new TRPCError({ code: "FORBIDDEN" });

            const { unlistedSlug } = await import("@/lib/slug");
            const newSlug =
                input.privacy === "unlisted" && video.currentPrivacy !== "unlisted" ? unlistedSlug() : undefined;

            const patch: Partial<typeof videos.$inferInsert> = { privacy: input.privacy, updatedAt: new Date() };
            if (input.privacy === "unlisted") {
                patch.unlistedSlug = newSlug;
            } else {
                patch.unlistedSlug = null;
            }

            const [updated] = await ctx.db.update(videos).set(patch).where(eq(videos.id, input.videoId)).returning();
            return updated!;
        }),

    // ---------------------------------------------------------------------------
    // delete — soft delete by removing the row. Cascades clean up child rows.
    // The caller is responsible for separately wiping the on-disk source +
    // hls files; we leave that to a future janitor pass so a delete is fast.
    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // trending — public+ready videos ranked by HN-style gravity decay so a
    // freshly-uploaded video with strong views ranks above an older video
    // with the same view count. Score = view_count / pow(age_hours + 2, 1.5).
    // ---------------------------------------------------------------------------
    trending: publicProcedure
        .input(
            z.object({
                limit: z.number().int().min(1).max(50).default(20),
            }),
        )
        .query(async ({ ctx, input }) => {
            type Row = {
                id: string;
                title: string;
                thumbnailPath: string | null;
                durationSec: number | null;
                viewCount: number;
                publishedAt: Date | null;
                channelName: string;
                channelHandle: string;
            };

            const rows = await ctx.db.execute<Row>(sql`
                SELECT
                    v.id,
                    v.title,
                    v.thumbnail_path AS "thumbnailPath",
                    v.duration_sec   AS "durationSec",
                    v.view_count     AS "viewCount",
                    v.published_at   AS "publishedAt",
                    c.name           AS "channelName",
                    c.handle         AS "channelHandle"
                FROM videos v
                JOIN channels c ON c.id = v.channel_id
                WHERE v.privacy = 'public' AND v.status = 'ready'
                ORDER BY (v.view_count::float /
                    power(extract(epoch from now() - coalesce(v.published_at, v.created_at)) / 3600.0 + 2.0, 1.5)) DESC,
                    v.published_at DESC
                LIMIT ${input.limit}
            `);

            return rows.map((r) => ({
                id: r.id,
                title: r.title,
                thumbnailPath: r.thumbnailPath,
                durationSec: r.durationSec,
                viewCount: Number(r.viewCount),
                publishedAt: r.publishedAt,
                channel: { name: r.channelName, handle: r.channelHandle },
            }));
        }),

    // ---------------------------------------------------------------------------
    // setThumbnailFromSprite — extract a frame from the 10×10 sprite and save it
    // as thumbnail.jpg. frameIndex is 0-99. Caller must be a channel member.
    // ---------------------------------------------------------------------------
    setThumbnailFromSprite: protectedProcedure
        .input(
            z.object({
                videoId: z.string().uuid(),
                frameIndex: z.number().int().min(0).max(99),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            // Load video to get channelId, sourcePath, durationSec.
            const videoRows = await ctx.db
                .select({
                    channelId: videos.channelId,
                    sourcePath: videos.sourcePath,
                    durationSec: videos.durationSec,
                })
                .from(videos)
                .where(eq(videos.id, input.videoId))
                .limit(1);
            const video = videoRows[0];
            if (!video) throw new TRPCError({ code: "NOT_FOUND" });

            // Auth: must be a channel member.
            const memberRows = await ctx.db
                .select({ role: channelMembers.role })
                .from(channelMembers)
                .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, ctx.user.id)))
                .limit(1);
            if (!memberRows[0]) throw new TRPCError({ code: "FORBIDDEN" });

            if (!video.sourcePath) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Source file path is not available." });
            }
            const durationSec = video.durationSec ?? 0;
            if (durationSec <= 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Video duration is not available." });
            }

            // Compute timestamp: sprite has 100 evenly-spaced frames.
            const timestampSec = (input.frameIndex / 100) * durationSec;

            const { hlsThumbnailPath } = await import("@/lib/paths");
            const { runFfmpeg } = await import("@/lib/transcode/ffmpeg");

            const thumbPath = hlsThumbnailPath(input.videoId);

            // Extract the single frame.
            await runFfmpeg([
                "-ss",
                String(timestampSec),
                "-i",
                video.sourcePath,
                "-frames:v",
                "1",
                "-q:v",
                "3",
                "-vf",
                "scale=1280:-1",
                thumbPath,
            ]);

            // Compute the relative path stored in the DB (relative to MEDIA_HLS_PATH).
            const { resolve, relative } = await import("node:path");
            const hlsRoot = resolve(env.MEDIA_HLS_PATH);
            const relPath = relative(hlsRoot, thumbPath);

            // Persist the updated thumbnailPath.
            const [updated] = await ctx.db
                .update(videos)
                .set({ thumbnailPath: relPath, updatedAt: new Date() })
                .where(eq(videos.id, input.videoId))
                .returning({ thumbnailPath: videos.thumbnailPath });

            return { thumbnailPath: updated?.thumbnailPath ?? relPath };
        }),

    // ---------------------------------------------------------------------------
    // setChapters — replace manual chapters for a video. Member-only.
    // Preserves rows with source='container' or source='description';
    // replaces all source='manual' rows with the new set.
    // ---------------------------------------------------------------------------
    setChapters: protectedProcedure
        .input(
            z.object({
                videoId: z.string().uuid(),
                chapters: z
                    .array(
                        z.object({
                            startSec: z.number().int().nonnegative(),
                            title: z.string().trim().min(1).max(200),
                        }),
                    )
                    .max(200),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const videoRows = await ctx.db
                .select({ channelId: videos.channelId })
                .from(videos)
                .where(eq(videos.id, input.videoId))
                .limit(1);
            const video = videoRows[0];
            if (!video) throw new TRPCError({ code: "NOT_FOUND" });

            const memberRows = await ctx.db
                .select({ role: channelMembers.role })
                .from(channelMembers)
                .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, ctx.user.id)))
                .limit(1);
            if (!memberRows[0]) throw new TRPCError({ code: "FORBIDDEN" });

            // Delete all manual rows then re-insert. Wrap in a transaction so
            // the chapter list is never partially replaced on failure.
            await ctx.db.transaction(async (tx) => {
                await tx
                    .delete(videoChapters)
                    .where(and(eq(videoChapters.videoId, input.videoId), eq(videoChapters.source, "manual")));

                if (input.chapters.length > 0) {
                    await tx.insert(videoChapters).values(
                        input.chapters.map((ch) => ({
                            videoId: input.videoId,
                            startSec: ch.startSec,
                            title: ch.title,
                            source: "manual" as const,
                        })),
                    );
                }
            });

            return { ok: true };
        }),

    delete: protectedProcedure.input(z.object({ videoId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
        const videoRows = await ctx.db
            .select({
                channelId: videos.channelId,
                sourcePath: videos.sourcePath,
            })
            .from(videos)
            .where(eq(videos.id, input.videoId))
            .limit(1);
        const video = videoRows[0];
        if (!video) throw new TRPCError({ code: "NOT_FOUND" });

        const memberRows = await ctx.db
            .select({ role: channelMembers.role })
            .from(channelMembers)
            .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, ctx.user.id)))
            .limit(1);
        const role = memberRows[0]?.role;
        if (role !== "owner" && role !== "manager") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Only owners or managers can delete videos." });
        }

        // Capture the channel handle before we delete the video row so
        // the on-disk cleanup can rebuild the source path even if the
        // sourcePath column is null.
        const channelRows = await ctx.db
            .select({ handle: channels.handle })
            .from(channels)
            .where(eq(channels.id, video.channelId))
            .limit(1);
        const channelHandle = channelRows[0]?.handle ?? "_orphan";

        await ctx.db.delete(videos).where(eq(videos.id, input.videoId));

        // Best-effort filesystem cleanup. Fire-and-forget so the API
        // returns quickly even on slow disks; errors are logged inside
        // the helper.
        const { cleanupVideoFiles } = await import("@/lib/cleanup");
        void cleanupVideoFiles({
            videoId: input.videoId,
            sourcePath: video.sourcePath,
            channelHandle,
        });

        return { ok: true };
    }),
});
