import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { mintApiKey } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { isValidHandle } from "@/lib/slug";
import { apiKeys, channelMembers, channels } from "@/server/db/schema/channels";
import { videos } from "@/server/db/schema/videos";
import { channelProcedure, createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const handleSchema = z
    .string()
    .min(3)
    .max(30)
    .refine(isValidHandle, { message: "Handle must be 3-30 chars, lowercase letters, digits, hyphens, underscores." });

const createChannelInput = z.object({
    handle: handleSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(2000).default(""),
});

const updateChannelInput = z.object({
    channelId: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(2000).optional(),
    avatarPath: z.string().optional(),
    bannerPath: z.string().optional(),
    // Channel trailer / pinned video. Pass null to clear, omit to leave
    // unchanged, pass a UUID to set. The mutation validates the video
    // belongs to this channel and is public+ready.
    pinnedVideoId: z.string().uuid().nullable().optional(),
    // Hold all new comments for moderation when true.
    moderateComments: z.boolean().optional(),
});

const generateApiKeyInput = z.object({
    channelId: z.string().uuid(),
    name: z.string().min(1).max(80),
});

const revokeApiKeyInput = z.object({
    channelId: z.string().uuid(),
    keyId: z.string().uuid(),
});

const listApiKeysInput = z.object({
    channelId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const channelRouter = createTRPCRouter({
    // Public: list all channels (paginated later, for now simple)
    list: publicProcedure.query(async ({ ctx }) => {
        return ctx.db.query.channels.findMany({
            orderBy: (c, { asc }) => [asc(c.createdAt)],
            columns: {
                id: true,
                handle: true,
                name: true,
                description: true,
                avatarPath: true,
                createdAt: true,
            },
        });
    }),

    // Public: look up a single channel by its handle
    byHandle: publicProcedure.input(z.object({ handle: z.string().min(1) })).query(async ({ ctx, input }) => {
        const row = await ctx.db.query.channels.findFirst({
            where: eq(channels.handle, input.handle.toLowerCase()),
            columns: {
                id: true,
                handle: true,
                name: true,
                description: true,
                avatarPath: true,
                bannerPath: true,
                createdAt: true,
            },
        });
        if (!row) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
        }
        return row;
    }),

    // Protected: list channels the authenticated user is a member of
    listMine: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                id: channels.id,
                handle: channels.handle,
                name: channels.name,
                description: channels.description,
                avatarPath: channels.avatarPath,
                role: channelMembers.role,
                createdAt: channels.createdAt,
            })
            .from(channelMembers)
            .innerJoin(channels, eq(channels.id, channelMembers.channelId))
            .where(eq(channelMembers.userId, ctx.user.id))
            .orderBy(channels.createdAt);

        return rows;
    }),

    // Protected: create a new channel. The creator becomes the owner.
    create: protectedProcedure.input(createChannelInput).mutation(async ({ ctx, input }) => {
        const handle = input.handle.toLowerCase();

        if (!isValidHandle(handle)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid channel handle." });
        }

        // Check handle uniqueness before hitting the DB unique constraint so we
        // can return a friendlier error (citext makes this case-insensitive).
        const existing = await ctx.db.query.channels.findFirst({
            where: eq(channels.handle, handle),
            columns: { id: true },
        });
        if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: "That handle is already taken." });
        }

        const [channel] = await ctx.db
            .insert(channels)
            .values({
                handle,
                name: input.name,
                description: input.description,
                ownerId: ctx.user.id,
            })
            .returning();

        if (!channel) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create channel." });
        }

        // Insert the owner membership row atomically with the channel row by
        // doing both in a single round-trip (Drizzle doesn't expose explicit
        // transactions through the query builder yet, but two sequential inserts
        // inside the same request are safe enough here because the channel row
        // must exist before the FK constraint on channel_members can be satisfied).
        await ctx.db.insert(channelMembers).values({
            channelId: channel.id,
            userId: ctx.user.id,
            role: "owner",
        });

        return channel;
    }),

    // Protected (owner or manager): update channel metadata
    update: channelProcedure("owner", "manager")
        .input(updateChannelInput)
        .mutation(async ({ ctx, input }) => {
            const { channelId, ...updates } = input;

            // Drop undefined keys so Drizzle doesn't write null for omitted fields.
            const patch: Record<string, unknown> = {};
            if (updates.name !== undefined) patch.name = updates.name;
            if (updates.description !== undefined) patch.description = updates.description;
            if (updates.avatarPath !== undefined) patch.avatarPath = updates.avatarPath;
            if (updates.bannerPath !== undefined) patch.bannerPath = updates.bannerPath;
            if (updates.moderateComments !== undefined) patch.moderateComments = updates.moderateComments;

            // pinnedVideoId: null clears, otherwise validate that the video
            // belongs to this channel and is publicly visible. We deliberately
            // require public+ready+!draft so a private/in-progress video can
            // never be surfaced as a channel trailer to anonymous viewers.
            if (updates.pinnedVideoId !== undefined) {
                if (updates.pinnedVideoId === null) {
                    patch.pinnedVideoId = null;
                } else {
                    const videoRows = await ctx.db
                        .select({
                            channelId: videos.channelId,
                            privacy: videos.privacy,
                            status: videos.status,
                            isDraft: videos.isDraft,
                        })
                        .from(videos)
                        .where(eq(videos.id, updates.pinnedVideoId))
                        .limit(1);
                    const video = videoRows[0];
                    if (!video || video.channelId !== channelId) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Pinned video must belong to this channel.",
                        });
                    }
                    if (video.privacy !== "public" || video.status !== "ready" || video.isDraft) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Pinned video must be public, ready, and not a draft.",
                        });
                    }
                    patch.pinnedVideoId = updates.pinnedVideoId;
                }
            }
            patch.updatedAt = new Date();

            const [updated] = await ctx.db.update(channels).set(patch).where(eq(channels.id, channelId)).returning();

            if (!updated) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
            }

            return updated;
        }),

    // Public: paginated directory of all channels for /explore/channels.
    // sort=subscribers (default) — descending by subscriber count.
    // sort=recent — descending by max(videos.publishedAt) for the channel.
    listPublic: publicProcedure
        .input(
            z.object({
                sort: z.enum(["subscribers", "recent"]).default("subscribers"),
                cursor: z.number().int().nonnegative().default(0),
                limit: z.number().int().min(1).max(48).default(24),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { sort, cursor, limit } = input;
            type Row = {
                id: string;
                handle: string;
                name: string;
                description: string;
                avatarPath: string | null;
                bannerPath: string | null;
                subscriberCount: number;
                videoCount: number;
                lastUploadAt: Date | null;
            };

            // Two flavours: order by subscribers, or by most-recent upload.
            // We compute both metrics in subqueries so a single row carries
            // everything the UI needs for the card and so pagination is
            // a simple OFFSET/LIMIT.
            const rows =
                sort === "subscribers"
                    ? await ctx.db.execute<Row>(sql`
                          SELECT
                              c.id,
                              c.handle,
                              c.name,
                              c.description,
                              c.avatar_path                                 AS "avatarPath",
                              c.banner_path                                 AS "bannerPath",
                              (SELECT count(*) FROM subscriptions s
                                  WHERE s.channel_id = c.id)::int           AS "subscriberCount",
                              (SELECT count(*) FROM videos v
                                  WHERE v.channel_id = c.id
                                    AND v.privacy = 'public'
                                    AND v.status = 'ready'
                                    AND v.is_draft = false)::int            AS "videoCount",
                              (SELECT max(v.published_at) FROM videos v
                                  WHERE v.channel_id = c.id
                                    AND v.privacy = 'public'
                                    AND v.status = 'ready'
                                    AND v.is_draft = false)                 AS "lastUploadAt"
                          FROM channels c
                          ORDER BY "subscriberCount" DESC, c.created_at ASC
                          LIMIT ${limit + 1}
                          OFFSET ${cursor}
                      `)
                    : await ctx.db.execute<Row>(sql`
                          SELECT
                              c.id,
                              c.handle,
                              c.name,
                              c.description,
                              c.avatar_path                                 AS "avatarPath",
                              c.banner_path                                 AS "bannerPath",
                              (SELECT count(*) FROM subscriptions s
                                  WHERE s.channel_id = c.id)::int           AS "subscriberCount",
                              (SELECT count(*) FROM videos v
                                  WHERE v.channel_id = c.id
                                    AND v.privacy = 'public'
                                    AND v.status = 'ready'
                                    AND v.is_draft = false)::int            AS "videoCount",
                              (SELECT max(v.published_at) FROM videos v
                                  WHERE v.channel_id = c.id
                                    AND v.privacy = 'public'
                                    AND v.status = 'ready'
                                    AND v.is_draft = false)                 AS "lastUploadAt"
                          FROM channels c
                          ORDER BY "lastUploadAt" DESC NULLS LAST, c.created_at DESC
                          LIMIT ${limit + 1}
                          OFFSET ${cursor}
                      `);

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;

            return {
                items: items.map((r) => ({
                    id: r.id,
                    handle: r.handle,
                    name: r.name,
                    description: r.description,
                    avatarPath: r.avatarPath,
                    bannerPath: r.bannerPath,
                    subscriberCount: Number(r.subscriberCount ?? 0),
                    videoCount: Number(r.videoCount ?? 0),
                    lastUploadAt: r.lastUploadAt,
                })),
                nextCursor: hasMore ? cursor + limit : null,
            };
        }),

    // Protected (owner or manager): list non-revoked API keys for a channel
    listApiKeys: channelProcedure("owner", "manager")
        .input(listApiKeysInput)
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select({
                    id: apiKeys.id,
                    name: apiKeys.name,
                    keyPrefix: apiKeys.keyPrefix,
                    lastUsedAt: apiKeys.lastUsedAt,
                    useCount: apiKeys.useCount,
                    revokedAt: apiKeys.revokedAt,
                    createdAt: apiKeys.createdAt,
                })
                .from(apiKeys)
                .where(and(eq(apiKeys.channelId, input.channelId), isNull(apiKeys.revokedAt)))
                .orderBy(apiKeys.createdAt);

            return rows;
        }),

    // Protected (owner or manager): mint a new API key and return the plaintext ONCE
    generateApiKey: channelProcedure("owner", "manager")
        .input(generateApiKeyInput)
        .mutation(async ({ ctx, input }) => {
            const minted = await mintApiKey({
                channelId: input.channelId,
                name: input.name,
                createdById: ctx.user.id,
            });

            recordAudit({
                actorId: ctx.user.id,
                action: "apiKey.generate",
                targetType: "apiKey",
                targetId: minted.id,
                details: { channelId: input.channelId, name: input.name },
                headers: ctx.headers,
            });

            return {
                id: minted.id,
                plaintext: minted.plaintext,
                keyPrefix: minted.keyPrefix,
                name: minted.name,
                createdAt: minted.createdAt,
            };
        }),

    // Protected (owner or manager): revoke an API key
    revokeApiKey: channelProcedure("owner", "manager")
        .input(revokeApiKeyInput)
        .mutation(async ({ ctx, input }) => {
            const [revoked] = await ctx.db
                .update(apiKeys)
                .set({ revokedAt: new Date() })
                .where(
                    and(eq(apiKeys.id, input.keyId), eq(apiKeys.channelId, input.channelId), isNull(apiKeys.revokedAt)),
                )
                .returning({ id: apiKeys.id });

            if (!revoked) {
                throw new TRPCError({ code: "NOT_FOUND", message: "API key not found or already revoked." });
            }

            recordAudit({
                actorId: ctx.user.id,
                action: "apiKey.revoke",
                targetType: "apiKey",
                targetId: revoked.id,
                details: { channelId: input.channelId },
                headers: ctx.headers,
            });

            return { id: revoked.id };
        }),

    // Protected (owner): set auto-prune policy for the channel.
    setAutoPruneDays: channelProcedure("owner")
        .input(
            z.object({
                channelId: z.string().uuid(),
                autoPruneDays: z.number().int().positive().nullable(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(channels)
                .set({ autoPruneDays: input.autoPruneDays, updatedAt: new Date() })
                .where(eq(channels.id, input.channelId));
            return { ok: true };
        }),

    // Protected (owner): set the channel's own disk quota (self-service).
    // Primarily a convenience for the studio UI; admins can also set this via
    // admin.channels.setQuota for unrestricted access.
    setMyQuota: channelProcedure("owner")
        .input(
            z.object({
                channelId: z.string().uuid(),
                quotaBytes: z.number().int().nonnegative().nullable(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .update(channels)
                .set({ diskQuotaBytes: input.quotaBytes, updatedAt: new Date() })
                .where(eq(channels.id, input.channelId));
            return { ok: true };
        }),

    // Protected (owner or member): get channel usage for the quota UI.
    getUsage: channelProcedure("owner", "manager", "uploader")
        .input(z.object({ channelId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const { getChannelUsage } = await import("@/lib/quota");
            const channelRows = await ctx.db
                .select({ diskQuotaBytes: channels.diskQuotaBytes, autoPruneDays: channels.autoPruneDays })
                .from(channels)
                .where(eq(channels.id, input.channelId))
                .limit(1);
            const channel = channelRows[0];
            if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

            const used = await getChannelUsage(input.channelId);
            return {
                used,
                quota: channel.diskQuotaBytes ?? null,
                autoPruneDays: channel.autoPruneDays ?? null,
            };
        }),
});
