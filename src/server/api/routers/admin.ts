import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, isNull, lt, or, sql, sum } from "drizzle-orm";
import { z } from "zod";

import { cleanupVideoFiles } from "@/lib/cleanup";
import { paths } from "@/lib/paths";
import { invalidateSiteConfigCache } from "@/lib/site-config";
import { recordAudit } from "@/lib/audit";
import { adminGrants } from "@/server/db/schema/admin";
import { auditLogs } from "@/server/db/schema/audit";
import { session, user } from "@/server/db/schema/auth";
import { siteConfig, privacyModeEnum } from "@/server/db/schema/site";
import { channelMembers, channels } from "@/server/db/schema/channels";
import { transcodeJobs } from "@/server/db/schema/jobs";
import { channelBandwidthDaily } from "@/server/db/schema/metrics";
import { comments } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Recursively sum the bytes of all files under `dir`. Returns 0 if the dir
 *  does not exist. */
const duBytes = async (dir: string): Promise<number> => {
    let total = 0;
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
            total += await duBytes(full);
        } else {
            try {
                const s = await stat(full);
                total += s.size;
            } catch {
                // ignore
            }
        }
    }
    return total;
};

// ---------------------------------------------------------------------------
// Nested sub-routers
// ---------------------------------------------------------------------------

const usersRouter = createTRPCRouter({
    list: adminProcedure
        .input(
            z.object({
                q: z.string().optional(),
                cursor: z.string().optional(),
                limit: z.number().int().positive().max(100).default(50),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { q, cursor, limit } = input;

            const whereClause = and(
                q ? or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`)) : undefined,
                cursor ? sql`${user.createdAt} < ${new Date(cursor)}` : undefined,
            );

            const rows = await ctx.db
                .select({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    createdAt: user.createdAt,
                })
                .from(user)
                .where(whereClause)
                .orderBy(desc(user.createdAt))
                .limit(limit + 1);

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;

            // Batch: channel counts, last sign-in, admin flag for the page.
            const ids = items.map((r) => r.id);

            const [channelCounts, lastSessions, adminRows] = await Promise.all([
                ids.length > 0
                    ? ctx.db
                          .select({
                              ownerId: channels.ownerId,
                              cnt: count(channels.id),
                          })
                          .from(channels)
                          .where(
                              sql`${channels.ownerId} = ANY(${sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(",")}]`)})`,
                          )
                          .groupBy(channels.ownerId)
                    : Promise.resolve([]),
                ids.length > 0
                    ? ctx.db
                          .select({
                              userId: session.userId,
                              lastSignIn: sql<Date>`MAX(${session.createdAt})`.mapWith(Date),
                          })
                          .from(session)
                          .where(
                              sql`${session.userId} = ANY(${sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(",")}]`)})`,
                          )
                          .groupBy(session.userId)
                    : Promise.resolve([]),
                ids.length > 0
                    ? ctx.db
                          .select({ userId: adminGrants.userId })
                          .from(adminGrants)
                          .where(
                              sql`${adminGrants.userId} = ANY(${sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(",")}]`)})`,
                          )
                    : Promise.resolve([]),
            ]);

            const channelCountMap = new Map(channelCounts.map((r) => [r.ownerId, Number(r.cnt)]));
            const lastSignInMap = new Map(lastSessions.map((r) => [r.userId, r.lastSignIn]));
            const adminSet = new Set(adminRows.map((r) => r.userId));

            const enriched = items.map((r) => ({
                ...r,
                channelCount: channelCountMap.get(r.id) ?? 0,
                lastSignIn: lastSignInMap.get(r.id) ?? null,
                isAdmin: adminSet.has(r.id),
            }));

            const last = items[items.length - 1];
            return {
                items: enriched,
                nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
            };
        }),

    byId: adminProcedure.input(z.object({ userId: z.string() })).query(async ({ ctx, input }) => {
        const userRows = await ctx.db.select().from(user).where(eq(user.id, input.userId)).limit(1);
        const targetUser = userRows[0];
        if (!targetUser) throw new TRPCError({ code: "NOT_FOUND" });

        const [ownedChannels, videoCount, sessions, adminRow] = await Promise.all([
            ctx.db.select().from(channels).where(eq(channels.ownerId, input.userId)),
            ctx.db
                .select({ cnt: count(videos.id) })
                .from(videos)
                .innerJoin(channelMembers, eq(videos.channelId, channelMembers.channelId))
                .where(eq(channelMembers.userId, input.userId)),
            ctx.db
                .select({
                    id: session.id,
                    ipAddress: session.ipAddress,
                    userAgent: session.userAgent,
                    createdAt: session.createdAt,
                    expiresAt: session.expiresAt,
                })
                .from(session)
                .where(eq(session.userId, input.userId))
                .orderBy(desc(session.createdAt))
                .limit(20),
            ctx.db
                .select({ grantedAt: adminGrants.grantedAt, grantedBy: adminGrants.grantedBy })
                .from(adminGrants)
                .where(eq(adminGrants.userId, input.userId))
                .limit(1),
        ]);

        return {
            user: targetUser,
            ownedChannels,
            videoCount: Number(videoCount[0]?.cnt ?? 0),
            sessions,
            isAdmin: !!adminRow[0],
            adminGrant: adminRow[0] ?? null,
        };
    }),

    promote: adminProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
        await ctx.db
            .insert(adminGrants)
            .values({
                userId: input.userId,
                grantedBy: ctx.user.id,
            })
            .onConflictDoNothing({ target: adminGrants.userId });
        recordAudit({
            actorId: ctx.user.id,
            action: "user.promote",
            targetType: "user",
            targetId: input.userId,
            details: { grantedBy: ctx.user.id },
            headers: ctx.headers,
        });
        return { ok: true };
    }),

    demote: adminProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
        // Refuse to demote the last admin.
        const totalRows = await ctx.db.select({ cnt: count(adminGrants.userId) }).from(adminGrants);
        const total = Number(totalRows[0]?.cnt ?? 0);
        if (total <= 1) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Cannot demote the last admin.",
            });
        }
        await ctx.db.delete(adminGrants).where(eq(adminGrants.userId, input.userId));
        recordAudit({
            actorId: ctx.user.id,
            action: "user.demote",
            targetType: "user",
            targetId: input.userId,
            headers: ctx.headers,
        });
        return { ok: true };
    }),

    delete: adminProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete your own account." });
        }
        const userRows = await ctx.db
            .select({ email: user.email, name: user.name })
            .from(user)
            .where(eq(user.id, input.userId))
            .limit(1);
        const deletedUser = userRows[0];
        await ctx.db.delete(user).where(eq(user.id, input.userId));
        recordAudit({
            actorId: ctx.user.id,
            action: "user.delete",
            targetType: "user",
            targetId: input.userId,
            details: { email: deletedUser?.email ?? null, name: deletedUser?.name ?? null },
            headers: ctx.headers,
        });
        return { ok: true };
    }),

    signOutAll: adminProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
        await ctx.db.delete(session).where(eq(session.userId, input.userId));
        recordAudit({
            actorId: ctx.user.id,
            action: "user.signOutAll",
            targetType: "user",
            targetId: input.userId,
            headers: ctx.headers,
        });
        return { ok: true };
    }),
});

const channelsAdminRouter = createTRPCRouter({
    setQuota: adminProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                quotaBytes: z.number().int().nonnegative().nullable(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const channelRows = await ctx.db
                .select({ id: channels.id, name: channels.name })
                .from(channels)
                .where(eq(channels.id, input.channelId))
                .limit(1);
            if (!channelRows[0]) throw new TRPCError({ code: "NOT_FOUND" });

            await ctx.db
                .update(channels)
                .set({ diskQuotaBytes: input.quotaBytes, updatedAt: new Date() })
                .where(eq(channels.id, input.channelId));

            recordAudit({
                actorId: ctx.user.id,
                action: "channel.quotaSet",
                targetType: "channel",
                targetId: input.channelId,
                details: { quotaBytes: input.quotaBytes, channelName: channelRows[0].name },
                headers: ctx.headers,
            });

            return { ok: true };
        }),
});

const videosRouter = createTRPCRouter({
    list: adminProcedure
        .input(
            z.object({
                q: z.string().optional(),
                cursor: z.string().uuid().optional(),
                limit: z.number().int().positive().max(100).default(50),
                channelId: z.string().uuid().optional(),
                status: z.enum(["queued", "transcoding", "ready", "failed"]).optional(),
                privacy: z.enum(["public", "unlisted", "private"]).optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { q, cursor, limit, channelId, status, privacy } = input;

            const cursorRow = cursor
                ? await ctx.db
                      .select({ createdAt: videos.createdAt })
                      .from(videos)
                      .where(eq(videos.id, cursor))
                      .limit(1)
                : [];
            const cursorTs = cursorRow[0]?.createdAt;

            const whereClause = and(
                q ? ilike(videos.title, `%${q}%`) : undefined,
                channelId ? eq(videos.channelId, channelId) : undefined,
                status ? eq(videos.status, status) : undefined,
                privacy ? eq(videos.privacy, privacy) : undefined,
                cursorTs ? sql`${videos.createdAt} < ${cursorTs}` : undefined,
            );

            const rows = await ctx.db
                .select({
                    video: videos,
                    channelName: channels.name,
                    channelHandle: channels.handle,
                    uploaderName: user.name,
                    uploaderEmail: user.email,
                })
                .from(videos)
                .innerJoin(channels, eq(videos.channelId, channels.id))
                .leftJoin(user, eq(videos.uploaderId, user.id))
                .where(whereClause)
                .orderBy(desc(videos.createdAt))
                .limit(limit + 1);

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            const last = items[items.length - 1];

            return {
                items,
                nextCursor: hasMore && last ? last.video.id : null,
            };
        }),

    transcribe: adminProcedure
        .input(
            z.object({
                videoId: z.string().uuid(),
                overwrite: z.boolean().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const videoRows = await ctx.db
                .select({ id: videos.id, status: videos.status, title: videos.title, channelId: videos.channelId })
                .from(videos)
                .where(eq(videos.id, input.videoId))
                .limit(1);
            const video = videoRows[0];
            if (!video) throw new TRPCError({ code: "NOT_FOUND" });
            if (video.status !== "ready") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Video is not ready (status: ${video.status}). Transcription requires a fully transcoded video.`,
                });
            }

            const { ensureBoss } = await import("@/worker/boot");
            const boss = await ensureBoss();
            await boss.send(
                "transcribe-video",
                { videoId: input.videoId, overwrite: input.overwrite ?? false },
                {
                    retryLimit: 1,
                    expireInHours: 4,
                    singletonKey: input.videoId,
                },
            );

            recordAudit({
                actorId: ctx.user.id,
                action: "video.transcribe",
                targetType: "video",
                targetId: input.videoId,
                details: { title: video.title, channelId: video.channelId, overwrite: input.overwrite ?? false },
                headers: ctx.headers,
            });

            return { ok: true };
        }),

    delete: adminProcedure.input(z.object({ videoId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
        const videoRows = await ctx.db
            .select({
                channelId: videos.channelId,
                sourcePath: videos.sourcePath,
                title: videos.title,
            })
            .from(videos)
            .where(eq(videos.id, input.videoId))
            .limit(1);
        const video = videoRows[0];
        if (!video) throw new TRPCError({ code: "NOT_FOUND" });

        const channelRows = await ctx.db
            .select({ handle: channels.handle })
            .from(channels)
            .where(eq(channels.id, video.channelId))
            .limit(1);
        const channelHandle = channelRows[0]?.handle ?? "_orphan";

        await ctx.db.delete(videos).where(eq(videos.id, input.videoId));
        recordAudit({
            actorId: ctx.user.id,
            action: "video.delete",
            targetType: "video",
            targetId: input.videoId,
            details: { title: video.title, channelId: video.channelId },
            headers: ctx.headers,
        });

        void cleanupVideoFiles({
            videoId: input.videoId,
            sourcePath: video.sourcePath,
            channelHandle,
        });

        return { ok: true };
    }),
});

const jobsRouter = createTRPCRouter({
    list: adminProcedure
        .input(
            z.object({
                state: z.enum(["queued", "running", "completed", "failed"]).optional(),
                limit: z.number().int().positive().max(200).default(50),
            }),
        )
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select({
                    job: transcodeJobs,
                    videoTitle: videos.title,
                    channelHandle: channels.handle,
                })
                .from(transcodeJobs)
                .innerJoin(videos, eq(transcodeJobs.videoId, videos.id))
                .innerJoin(channels, eq(videos.channelId, channels.id))
                .where(input.state ? eq(transcodeJobs.state, input.state) : undefined)
                .orderBy(desc(transcodeJobs.createdAt))
                .limit(input.limit);

            return rows;
        }),

    retry: adminProcedure.input(z.object({ videoId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
        // Reset existing failed job row.
        await ctx.db
            .update(transcodeJobs)
            .set({ state: "queued", progress: 0, step: null, message: null, startedAt: null, finishedAt: null })
            .where(and(eq(transcodeJobs.videoId, input.videoId), eq(transcodeJobs.state, "failed")));

        // Re-enqueue via pg-boss.
        const { ensureBoss } = await import("@/worker/boot");
        const boss = await ensureBoss();
        const pgbossJobId = await boss.send(
            "transcode-video",
            { videoId: input.videoId },
            {
                retryLimit: 2,
                retryBackoff: true,
                expireInHours: 6,
                singletonKey: input.videoId,
            },
        );

        if (pgbossJobId) {
            await ctx.db.update(transcodeJobs).set({ pgbossJobId }).where(eq(transcodeJobs.videoId, input.videoId));
        }

        recordAudit({
            actorId: ctx.user.id,
            action: "transcodeJob.retry",
            targetType: "job",
            targetId: input.videoId,
            headers: ctx.headers,
        });

        return { ok: true };
    }),
});

const storageRouter = createTRPCRouter({
    summary: adminProcedure.query(async ({ ctx }) => {
        // Pull all channel handles + ids + quota so we can map dirs to channels.
        const allChannels = await ctx.db
            .select({
                id: channels.id,
                handle: channels.handle,
                name: channels.name,
                diskQuotaBytes: channels.diskQuotaBytes,
            })
            .from(channels);

        const handleToChannel = new Map(allChannels.map((c) => [c.handle, c]));
        const idToChannel = new Map(allChannels.map((c) => [c.id, { ...c }]));

        // Source bytes from DB (fast, approximate).
        const sourceDbRows = await ctx.db
            .select({ ownerId: channels.ownerId, sourceBytes: sum(videos.sourceBytes) })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .groupBy(channels.ownerId);

        let totalSourceBytesDb = 0;
        for (const r of sourceDbRows) {
            totalSourceBytesDb += Number(r.sourceBytes ?? 0);
        }

        // HLS bytes — scan filesystem.
        let totalHlsBytes = 0;
        const channelHlsBytes = new Map<string, number>();

        try {
            const hlsEntries = await readdir(paths.hlsRoot, { withFileTypes: true });
            for (const e of hlsEntries) {
                if (!e.isDirectory()) continue;
                if (e.name === "_assets") continue;
                if (!isUuid(e.name)) continue;
                const bytes = await duBytes(join(paths.hlsRoot, e.name));
                totalHlsBytes += bytes;

                // Map videoId → channelId via DB.
                const vRows = await ctx.db
                    .select({ channelId: videos.channelId })
                    .from(videos)
                    .where(eq(videos.id, e.name))
                    .limit(1);
                const cId = vRows[0]?.channelId;
                if (cId) {
                    channelHlsBytes.set(cId, (channelHlsBytes.get(cId) ?? 0) + bytes);
                }
            }
        } catch {
            // hlsRoot may not exist in test environments.
        }

        // Assets bytes.
        let totalAssetBytes = 0;
        const channelAssetBytes = new Map<string, number>();
        try {
            const assetsRoot = join(paths.hlsRoot, "_assets");
            const assetEntries = await readdir(assetsRoot, { withFileTypes: true });
            for (const e of assetEntries) {
                if (!e.isDirectory() || !isUuid(e.name)) continue;
                const bytes = await duBytes(join(assetsRoot, e.name));
                totalAssetBytes += bytes;
                channelAssetBytes.set(e.name, (channelAssetBytes.get(e.name) ?? 0) + bytes);
            }
        } catch {
            // _assets may not exist.
        }

        // Source bytes from fs per channel handle.
        const channelSourceBytes = new Map<string, number>();
        try {
            const sourceEntries = await readdir(paths.sourceRoot, { withFileTypes: true });
            for (const e of sourceEntries) {
                if (!e.isDirectory() || e.name === ".tmp") continue;
                const channel = handleToChannel.get(e.name);
                if (!channel) continue;
                const bytes = await duBytes(join(paths.sourceRoot, e.name));
                channelSourceBytes.set(channel.id, bytes);
            }
        } catch {
            // sourceRoot may not exist.
        }

        // Aggregate per-channel totals, top 20.
        const allChannelIds = new Set([
            ...channelSourceBytes.keys(),
            ...channelHlsBytes.keys(),
            ...channelAssetBytes.keys(),
        ]);

        const perChannel = Array.from(allChannelIds).map((cId) => {
            const ch = idToChannel.get(cId);
            return {
                channelId: cId,
                channelName: ch?.name ?? cId,
                channelHandle: ch?.handle ?? "",
                diskQuotaBytes: ch?.diskQuotaBytes ?? null,
                sourceBytes: channelSourceBytes.get(cId) ?? 0,
                hlsBytes: channelHlsBytes.get(cId) ?? 0,
                assetBytes: channelAssetBytes.get(cId) ?? 0,
                totalBytes:
                    (channelSourceBytes.get(cId) ?? 0) +
                    (channelHlsBytes.get(cId) ?? 0) +
                    (channelAssetBytes.get(cId) ?? 0),
            };
        });

        perChannel.sort((a, b) => b.totalBytes - a.totalBytes);

        const totalSourceBytesFs = Array.from(channelSourceBytes.values()).reduce((a, b) => a + b, 0);

        return {
            totalSourceBytes: totalSourceBytesFs || totalSourceBytesDb,
            totalHlsBytes,
            totalAssetBytes,
            totalBytes: (totalSourceBytesFs || totalSourceBytesDb) + totalHlsBytes + totalAssetBytes,
            topChannels: perChannel.slice(0, 20),
        };
    }),

    runJanitor: adminProcedure.input(z.object({ apply: z.boolean() })).mutation(async ({ ctx, input }) => {
        const { apply } = input;

        let hlsRemoved = 0;
        let hlsKept = 0;
        let assetsRemoved = 0;
        let sourceRemoved = 0;
        let sourceKept = 0;
        const log: string[] = [];

        // Pass 1: HLS dirs.
        try {
            const entries = await readdir(paths.hlsRoot, { withFileTypes: true });
            for (const e of entries) {
                if (!e.isDirectory() || e.name === "_assets" || !isUuid(e.name)) continue;
                const rows = await ctx.db.select({ id: videos.id }).from(videos).where(eq(videos.id, e.name)).limit(1);
                if (rows[0]) {
                    hlsKept++;
                } else {
                    hlsRemoved++;
                    const target = join(paths.hlsRoot, e.name);
                    log.push(`orphan hls: ${target}`);
                    if (apply) {
                        const { rm } = await import("node:fs/promises");
                        await rm(target, { recursive: true, force: true });
                    }
                }
            }
        } catch {
            log.push(`hls pass: cannot read ${paths.hlsRoot}`);
        }

        // Pass 2: _assets dirs.
        try {
            const assetsRoot = join(paths.hlsRoot, "_assets");
            const channelDirs = await readdir(assetsRoot, { withFileTypes: true }).catch(() => []);
            for (const e of channelDirs) {
                if (!e.isDirectory() || !isUuid(e.name)) continue;
                const rows = await ctx.db
                    .select({ id: channels.id })
                    .from(channels)
                    .where(eq(channels.id, e.name))
                    .limit(1);
                if (!rows[0]) {
                    assetsRemoved++;
                    const target = join(assetsRoot, e.name);
                    log.push(`orphan asset: ${target}`);
                    if (apply) {
                        const { rm } = await import("node:fs/promises");
                        await rm(target, { recursive: true, force: true });
                    }
                }
            }
        } catch {
            // _assets may not exist.
        }

        // Pass 3: source files.
        try {
            const channelDirs = await readdir(paths.sourceRoot, { withFileTypes: true });
            for (const cd of channelDirs) {
                if (!cd.isDirectory() || cd.name === ".tmp") continue;
                const dir = join(paths.sourceRoot, cd.name);
                const files = await readdir(dir, { withFileTypes: true });
                for (const f of files) {
                    if (!f.isFile()) continue;
                    const base = f.name.replace(/\.[^.]+$/, "");
                    if (!isUuid(base)) continue;
                    const rows = await ctx.db
                        .select({ id: videos.id })
                        .from(videos)
                        .where(eq(videos.id, base))
                        .limit(1);
                    if (rows[0]) {
                        sourceKept++;
                    } else {
                        sourceRemoved++;
                        const target = join(dir, f.name);
                        log.push(`orphan source: ${target}`);
                        if (apply) {
                            const { rm } = await import("node:fs/promises");
                            await rm(target, { force: true });
                        }
                    }
                }
                const subDirs = files.filter((x) => x.isDirectory() && /\.captions$/.test(x.name));
                for (const sd of subDirs) {
                    const base = sd.name.replace(/\.captions$/, "");
                    if (!isUuid(base)) continue;
                    const rows = await ctx.db
                        .select({ id: videos.id })
                        .from(videos)
                        .where(eq(videos.id, base))
                        .limit(1);
                    if (!rows[0]) {
                        sourceRemoved++;
                        const target = join(dir, sd.name);
                        log.push(`orphan captions: ${target}`);
                        if (apply) {
                            const { rm } = await import("node:fs/promises");
                            await rm(target, { recursive: true, force: true });
                        }
                    }
                }
            }
        } catch {
            log.push(`source pass: cannot read ${paths.sourceRoot}`);
        }

        const summary = { hlsKept, hlsRemoved, assetsRemoved, sourceKept, sourceRemoved };

        recordAudit({
            actorId: ctx.user.id,
            action: "janitor.run",
            targetType: "site",
            details: { apply, summary },
            headers: ctx.headers,
        });

        return {
            apply,
            hlsKept,
            hlsRemoved,
            assetsRemoved,
            sourceKept,
            sourceRemoved,
            log,
        };
    }),
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const statsRouter = createTRPCRouter({
    overview: adminProcedure.query(async ({ ctx }) => {
        const [
            userCountRows,
            channelCountRows,
            videoStatusRows,
            commentCountRows,
            sourceBytesRows,
            pendingJobRows,
            failedJobRows,
        ] = await Promise.all([
            ctx.db.select({ cnt: count(user.id) }).from(user),
            ctx.db.select({ cnt: count(channels.id) }).from(channels),
            ctx.db
                .select({ status: videos.status, cnt: count(videos.id) })
                .from(videos)
                .groupBy(videos.status),
            ctx.db
                .select({ cnt: count(comments.id) })
                .from(comments)
                .where(isNull(comments.deletedAt)),
            ctx.db.select({ total: sum(videos.sourceBytes) }).from(videos),
            ctx.db
                .select({ cnt: count(transcodeJobs.id) })
                .from(transcodeJobs)
                .where(or(eq(transcodeJobs.state, "queued"), eq(transcodeJobs.state, "running"))),
            ctx.db
                .select({ cnt: count(transcodeJobs.id) })
                .from(transcodeJobs)
                .where(eq(transcodeJobs.state, "failed")),
        ]);

        const statusMap: Record<string, number> = {};
        for (const r of videoStatusRows) {
            statusMap[r.status] = Number(r.cnt);
        }

        return {
            userCount: Number(userCountRows[0]?.cnt ?? 0),
            channelCount: Number(channelCountRows[0]?.cnt ?? 0),
            videoCount: {
                queued: statusMap["queued"] ?? 0,
                transcoding: statusMap["transcoding"] ?? 0,
                ready: statusMap["ready"] ?? 0,
                failed: statusMap["failed"] ?? 0,
                total: Object.values(statusMap).reduce((a, b) => a + b, 0),
            },
            commentCount: Number(commentCountRows[0]?.cnt ?? 0),
            videoBytes: Number(sourceBytesRows[0]?.total ?? 0),
            pendingTranscodeJobs: Number(pendingJobRows[0]?.cnt ?? 0),
            failedTranscodeJobs: Number(failedJobRows[0]?.cnt ?? 0),
        };
    }),
});

// ---------------------------------------------------------------------------
// Site config sub-router
// ---------------------------------------------------------------------------

const siteConfigRouter = createTRPCRouter({
    get: publicProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({ privacyMode: siteConfig.privacyMode, updatedAt: siteConfig.updatedAt })
            .from(siteConfig)
            .where(eq(siteConfig.id, 1))
            .limit(1);
        return rows[0] ?? { privacyMode: "public" as const, updatedAt: new Date() };
    }),

    set: adminProcedure
        .input(z.object({ privacyMode: z.enum(privacyModeEnum.enumValues) }))
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db
                .select({ privacyMode: siteConfig.privacyMode })
                .from(siteConfig)
                .where(eq(siteConfig.id, 1))
                .limit(1);
            const from = existing[0]?.privacyMode ?? null;

            await ctx.db
                .insert(siteConfig)
                .values({ id: 1, privacyMode: input.privacyMode, updatedById: ctx.user.id, updatedAt: new Date() })
                .onConflictDoUpdate({
                    target: siteConfig.id,
                    set: { privacyMode: input.privacyMode, updatedById: ctx.user.id, updatedAt: new Date() },
                });
            invalidateSiteConfigCache();
            recordAudit({
                actorId: ctx.user.id,
                action: "siteConfig.set",
                targetType: "site",
                details: { from, to: input.privacyMode },
                headers: ctx.headers,
            });
            return { ok: true };
        }),
});

// ---------------------------------------------------------------------------
// Bandwidth sub-router
// ---------------------------------------------------------------------------

const bandwidthRouter = createTRPCRouter({
    summary: adminProcedure
        .input(z.object({ days: z.number().int().positive().max(365).default(14) }))
        .query(async ({ ctx, input }) => {
            const minBucket = Math.floor(Date.now() / 86_400_000) - input.days + 1;

            const rows = await ctx.db
                .select({
                    channelId: channelBandwidthDaily.channelId,
                    channelHandle: channels.handle,
                    channelName: channels.name,
                    totalBytes: sum(channelBandwidthDaily.bytes),
                })
                .from(channelBandwidthDaily)
                .innerJoin(channels, eq(channelBandwidthDaily.channelId, channels.id))
                .where(sql`${channelBandwidthDaily.bucket} >= ${minBucket}`)
                .groupBy(channelBandwidthDaily.channelId, channels.handle, channels.name)
                .orderBy(desc(sum(channelBandwidthDaily.bytes)))
                .limit(20);

            let grandTotal = 0;
            const channelRows = rows.map((r) => {
                const bytes = Number(r.totalBytes ?? 0);
                grandTotal += bytes;
                return {
                    channelId: r.channelId,
                    channelHandle: r.channelHandle,
                    channelName: r.channelName,
                    bytes,
                };
            });

            return { channels: channelRows, grandTotal, days: input.days };
        }),

    series: adminProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                days: z.number().int().positive().max(365).default(14),
            }),
        )
        .query(async ({ ctx, input }) => {
            const minBucket = Math.floor(Date.now() / 86_400_000) - input.days + 1;

            const rows = await ctx.db
                .select({
                    bucket: channelBandwidthDaily.bucket,
                    bytes: channelBandwidthDaily.bytes,
                })
                .from(channelBandwidthDaily)
                .where(
                    and(
                        eq(channelBandwidthDaily.channelId, input.channelId),
                        sql`${channelBandwidthDaily.bucket} >= ${minBucket}`,
                    ),
                )
                .orderBy(channelBandwidthDaily.bucket);

            return rows.map((r) => ({ bucket: r.bucket, bytes: Number(r.bytes) }));
        }),
});

// ---------------------------------------------------------------------------
// Audit sub-router
// ---------------------------------------------------------------------------

const auditRouter = createTRPCRouter({
    list: adminProcedure
        .input(
            z.object({
                cursor: z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).optional(),
                limit: z.number().int().positive().max(200).default(50),
                action: z.string().optional(),
                actorId: z.string().optional(),
                targetType: z.string().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { cursor, limit, action, actorId, targetType } = input;

            const actor = user;
            const actorAlias = {
                id: actor.id,
                name: actor.name,
                email: actor.email,
            };

            const cursorCondition = cursor
                ? or(
                      lt(auditLogs.createdAt, new Date(cursor.createdAt)),
                      and(eq(auditLogs.createdAt, new Date(cursor.createdAt)), lt(auditLogs.id, cursor.id)),
                  )
                : undefined;

            const whereClause = and(
                action ? sql`${auditLogs.action} = ${action}` : undefined,
                actorId ? eq(auditLogs.actorId, actorId) : undefined,
                targetType ? sql`${auditLogs.targetType} = ${targetType}` : undefined,
                cursorCondition,
            );

            const rows = await ctx.db
                .select({
                    id: auditLogs.id,
                    actorId: auditLogs.actorId,
                    actorName: actor.name,
                    actorEmail: actor.email,
                    action: auditLogs.action,
                    targetType: auditLogs.targetType,
                    targetId: auditLogs.targetId,
                    details: auditLogs.details,
                    ipAddress: auditLogs.ipAddress,
                    userAgent: auditLogs.userAgent,
                    createdAt: auditLogs.createdAt,
                })
                .from(auditLogs)
                .leftJoin(actor, eq(auditLogs.actorId, actorAlias.id))
                .where(whereClause)
                .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
                .limit(limit + 1);

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            const last = items[items.length - 1];

            return {
                items,
                nextCursor: hasMore && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
            };
        }),
});

// ---------------------------------------------------------------------------
// Root admin router
// ---------------------------------------------------------------------------

export const adminRouter = createTRPCRouter({
    stats: statsRouter,
    users: usersRouter,
    videos: videosRouter,
    jobs: jobsRouter,
    storage: storageRouter,
    siteConfig: siteConfigRouter,
    bandwidth: bandwidthRouter,
    audit: auditRouter,
    channels: channelsAdminRouter,
});
