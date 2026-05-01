import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, lt, max, sql } from "drizzle-orm";
import { z } from "zod";

import { unlistedSlug } from "@/lib/slug";
import { type Database } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { playlistItems, playlists, type PlaylistKind } from "@/server/db/schema/playlists";
import { videos } from "@/server/db/schema/videos";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure a system playlist (queue / watch_later) exists for the caller, creating it on first use. */
async function ensureSystemPlaylist(
    db: Database,
    userId: string,
    kind: Extract<PlaylistKind, "queue" | "watch_later">,
): Promise<string> {
    const titles: Record<typeof kind, string> = {
        queue: "Queue",
        watch_later: "Watch Later",
    };

    // Upsert: if a row already exists for this (owner, kind), return it.
    const existing = await db
        .select({ id: playlists.id })
        .from(playlists)
        .where(and(eq(playlists.ownerId, userId), eq(playlists.kind, kind)))
        .limit(1);

    if (existing[0]) return existing[0].id;

    const [created] = await db
        .insert(playlists)
        .values({
            ownerId: userId,
            kind,
            title: titles[kind],
            privacy: "private",
        })
        .onConflictDoNothing()
        .returning({ id: playlists.id });

    // Handle the rare race where two concurrent requests hit the upsert; re-query.
    if (!created) {
        const retry = await db
            .select({ id: playlists.id })
            .from(playlists)
            .where(and(eq(playlists.ownerId, userId), eq(playlists.kind, kind)))
            .limit(1);
        if (!retry[0]) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create system playlist." });
        return retry[0].id;
    }

    return created.id;
}

// ---------------------------------------------------------------------------
// Queue sub-router
// ---------------------------------------------------------------------------

const queueRouter = createTRPCRouter({
    /** Return all items in the caller's queue with their video data. */
    list: protectedProcedure.query(async ({ ctx }) => {
        const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "queue");
        return ctx.db
            .select({
                itemId: playlistItems.id,
                position: playlistItems.position,
                addedAt: playlistItems.addedAt,
                video: {
                    id: videos.id,
                    title: videos.title,
                    thumbnailPath: videos.thumbnailPath,
                    durationSec: videos.durationSec,
                    viewCount: videos.viewCount,
                    publishedAt: videos.publishedAt,
                },
                channel: {
                    name: channels.name,
                    handle: channels.handle,
                },
            })
            .from(playlistItems)
            .innerJoin(videos, eq(videos.id, playlistItems.videoId))
            .innerJoin(channels, eq(channels.id, videos.channelId))
            .where(eq(playlistItems.playlistId, playlistId))
            .orderBy(asc(playlistItems.position));
    }),

    /** Return the head item of the caller's queue without removing it. */
    peek: protectedProcedure.query(async ({ ctx }) => {
        const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "queue");
        const rows = await ctx.db
            .select({
                itemId: playlistItems.id,
                position: playlistItems.position,
                video: {
                    id: videos.id,
                    title: videos.title,
                    thumbnailPath: videos.thumbnailPath,
                    durationSec: videos.durationSec,
                    viewCount: videos.viewCount,
                    publishedAt: videos.publishedAt,
                },
                channel: {
                    name: channels.name,
                    handle: channels.handle,
                },
            })
            .from(playlistItems)
            .innerJoin(videos, eq(videos.id, playlistItems.videoId))
            .innerJoin(channels, eq(channels.id, videos.channelId))
            .where(eq(playlistItems.playlistId, playlistId))
            .orderBy(asc(playlistItems.position))
            .limit(1);
        return rows[0] ?? null;
    }),

    /** Append a video to the queue, or insert at a given position (shifts existing items down). */
    add: protectedProcedure
        .input(z.object({ videoId: z.string().uuid(), position: z.number().int().min(0).optional() }))
        .mutation(async ({ ctx, input }) => {
            const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "queue");

            if (input.position === undefined) {
                // Append at end: max position + 1, computed atomically.
                const [result] = await ctx.db
                    .select({ maxPos: max(playlistItems.position) })
                    .from(playlistItems)
                    .where(eq(playlistItems.playlistId, playlistId));
                const nextPos = (result?.maxPos ?? -1) + 1;
                const [item] = await ctx.db
                    .insert(playlistItems)
                    .values({ playlistId, videoId: input.videoId, position: nextPos })
                    .returning();
                return item;
            }

            // Insert at given position: shift existing items at >= position up by 1.
            await ctx.db.transaction(async (tx) => {
                // Shift items with position >= input.position up by 1.
                // Two-pass to avoid unique constraint violation: first negate, then set final.
                await tx
                    .update(playlistItems)
                    .set({ position: sql`-(${playlistItems.position} + 1)` })
                    .where(and(eq(playlistItems.playlistId, playlistId), gt(playlistItems.position, input.position! - 1)));
                await tx
                    .update(playlistItems)
                    .set({ position: sql`-(${playlistItems.position}) ` })
                    .where(and(eq(playlistItems.playlistId, playlistId), lt(playlistItems.position, 0)));
                await tx.insert(playlistItems).values({ playlistId, videoId: input.videoId, position: input.position! });
            });
            return { playlistId, videoId: input.videoId, position: input.position };
        }),

    /** Atomically pop the head item from the queue and return it. */
    next: protectedProcedure.mutation(async ({ ctx }) => {
        const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "queue");
        return ctx.db.transaction(async (tx) => {
            const [head] = await tx
                .select({ id: playlistItems.id, videoId: playlistItems.videoId, position: playlistItems.position })
                .from(playlistItems)
                .where(eq(playlistItems.playlistId, playlistId))
                .orderBy(asc(playlistItems.position))
                .limit(1);

            if (!head) return null;

            await tx.delete(playlistItems).where(eq(playlistItems.id, head.id));
            return head;
        });
    }),

    /** Remove all items from the caller's queue. */
    clear: protectedProcedure.mutation(async ({ ctx }) => {
        const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "queue");
        await ctx.db.delete(playlistItems).where(eq(playlistItems.playlistId, playlistId));
        return { ok: true };
    }),
});

// ---------------------------------------------------------------------------
// Watch Later sub-router
// ---------------------------------------------------------------------------

const watchLaterRouter = createTRPCRouter({
    add: protectedProcedure
        .input(z.object({ videoId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "watch_later");
            const [result] = await ctx.db
                .select({ maxPos: max(playlistItems.position) })
                .from(playlistItems)
                .where(eq(playlistItems.playlistId, playlistId));
            const nextPos = (result?.maxPos ?? -1) + 1;
            const [item] = await ctx.db
                .insert(playlistItems)
                .values({ playlistId, videoId: input.videoId, position: nextPos })
                .onConflictDoNothing()
                .returning();
            return item ?? null;
        }),

    remove: protectedProcedure
        .input(z.object({ videoId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "watch_later");
            await ctx.db
                .delete(playlistItems)
                .where(and(eq(playlistItems.playlistId, playlistId), eq(playlistItems.videoId, input.videoId)));
            return { ok: true };
        }),

    list: protectedProcedure
        .input(
            z.object({
                cursor: z.number().int().min(0).optional().default(0),
                limit: z.number().int().min(1).max(100).optional().default(50),
            }),
        )
        .query(async ({ ctx, input }) => {
            const playlistId = await ensureSystemPlaylist(ctx.db, ctx.user.id, "watch_later");
            const rows = await ctx.db
                .select({
                    itemId: playlistItems.id,
                    position: playlistItems.position,
                    addedAt: playlistItems.addedAt,
                    video: {
                        id: videos.id,
                        title: videos.title,
                        thumbnailPath: videos.thumbnailPath,
                        durationSec: videos.durationSec,
                        viewCount: videos.viewCount,
                        publishedAt: videos.publishedAt,
                    },
                    channel: {
                        name: channels.name,
                        handle: channels.handle,
                    },
                })
                .from(playlistItems)
                .innerJoin(videos, eq(videos.id, playlistItems.videoId))
                .innerJoin(channels, eq(channels.id, videos.channelId))
                .where(eq(playlistItems.playlistId, playlistId))
                .orderBy(desc(playlistItems.addedAt))
                .limit(input.limit)
                .offset(input.cursor);

            return {
                items: rows,
                nextCursor: rows.length === input.limit ? input.cursor + input.limit : undefined,
            };
        }),
});

// ---------------------------------------------------------------------------
// Main playlist router
// ---------------------------------------------------------------------------

export const playlistRouter = createTRPCRouter({
    // -------------------------------------------------------------------------
    // Public: list user-kind playlists
    // -------------------------------------------------------------------------
    list: publicProcedure
        .input(z.object({ ownerId: z.string().optional() }))
        .query(async ({ ctx, input }) => {
            if (input.ownerId) {
                // Public view: only public playlists for a given owner.
                return ctx.db
                    .select({
                        id: playlists.id,
                        title: playlists.title,
                        description: playlists.description,
                        privacy: playlists.privacy,
                        createdAt: playlists.createdAt,
                        updatedAt: playlists.updatedAt,
                    })
                    .from(playlists)
                    .where(
                        and(
                            eq(playlists.ownerId, input.ownerId),
                            eq(playlists.kind, "user"),
                            eq(playlists.privacy, "public"),
                        ),
                    )
                    .orderBy(desc(playlists.updatedAt));
            }

            // Authenticated: list all user-kind playlists owned by the caller.
            if (!ctx.user) {
                throw new TRPCError({ code: "UNAUTHORIZED" });
            }

            return ctx.db
                .select({
                    id: playlists.id,
                    title: playlists.title,
                    description: playlists.description,
                    privacy: playlists.privacy,
                    createdAt: playlists.createdAt,
                    updatedAt: playlists.updatedAt,
                })
                .from(playlists)
                .where(and(eq(playlists.ownerId, ctx.user.id), eq(playlists.kind, "user")))
                .orderBy(desc(playlists.updatedAt));
        }),

    // -------------------------------------------------------------------------
    // Public: load a single playlist with its items
    // -------------------------------------------------------------------------
    byId: publicProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                cursor: z.number().int().min(0).optional().default(0),
                limit: z.number().int().min(1).max(100).optional().default(50),
            }),
        )
        .query(async ({ ctx, input }) => {
            const playlist = await ctx.db
                .select()
                .from(playlists)
                .where(eq(playlists.id, input.id))
                .limit(1)
                .then((r) => r[0]);

            if (!playlist) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Playlist not found." });
            }

            // Privacy gate.
            if (playlist.privacy === "private") {
                if (!ctx.user || ctx.user.id !== playlist.ownerId) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "This playlist is private." });
                }
            }
            // Unlisted playlists are accessible by URL (no extra slug check needed here since
            // we look up by UUID; the slug is the shareable URL component handled at the page level).

            const items = await ctx.db
                .select({
                    itemId: playlistItems.id,
                    position: playlistItems.position,
                    addedAt: playlistItems.addedAt,
                    video: {
                        id: videos.id,
                        title: videos.title,
                        thumbnailPath: videos.thumbnailPath,
                        durationSec: videos.durationSec,
                        viewCount: videos.viewCount,
                        publishedAt: videos.publishedAt,
                    },
                    channel: {
                        name: channels.name,
                        handle: channels.handle,
                    },
                })
                .from(playlistItems)
                .innerJoin(videos, eq(videos.id, playlistItems.videoId))
                .innerJoin(channels, eq(channels.id, videos.channelId))
                .where(eq(playlistItems.playlistId, playlist.id))
                .orderBy(asc(playlistItems.position))
                .limit(input.limit)
                .offset(input.cursor);

            return {
                playlist: {
                    id: playlist.id,
                    title: playlist.title,
                    description: playlist.description,
                    privacy: playlist.privacy,
                    kind: playlist.kind,
                    ownerId: playlist.ownerId,
                    unlistedSlug: playlist.unlistedSlug,
                    createdAt: playlist.createdAt,
                    updatedAt: playlist.updatedAt,
                },
                items,
                nextCursor: items.length === input.limit ? input.cursor + input.limit : undefined,
            };
        }),

    // -------------------------------------------------------------------------
    // Protected: create a user-kind playlist
    // -------------------------------------------------------------------------
    create: protectedProcedure
        .input(
            z.object({
                title: z.string().min(1).max(200),
                description: z.string().max(5000).optional().default(""),
                privacy: z.enum(["public", "unlisted", "private"]).optional().default("private"),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const slug = input.privacy === "unlisted" ? unlistedSlug() : null;

            const [playlist] = await ctx.db
                .insert(playlists)
                .values({
                    ownerId: ctx.user.id,
                    kind: "user",
                    title: input.title,
                    description: input.description,
                    privacy: input.privacy,
                    unlistedSlug: slug,
                })
                .returning();

            if (!playlist) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create playlist." });
            }

            return playlist;
        }),

    // -------------------------------------------------------------------------
    // Protected: update a user-kind playlist (owner only)
    // -------------------------------------------------------------------------
    update: protectedProcedure
        .input(
            z.object({
                id: z.string().uuid(),
                title: z.string().min(1).max(200).optional(),
                description: z.string().max(5000).optional(),
                privacy: z.enum(["public", "unlisted", "private"]).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const playlist = await ctx.db
                .select({ id: playlists.id, ownerId: playlists.ownerId, privacy: playlists.privacy, unlistedSlug: playlists.unlistedSlug })
                .from(playlists)
                .where(eq(playlists.id, input.id))
                .limit(1)
                .then((r) => r[0]);

            if (!playlist) throw new TRPCError({ code: "NOT_FOUND", message: "Playlist not found." });
            if (playlist.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

            const patch: Record<string, unknown> = { updatedAt: new Date() };
            if (input.title !== undefined) patch.title = input.title;
            if (input.description !== undefined) patch.description = input.description;
            if (input.privacy !== undefined) {
                patch.privacy = input.privacy;
                // Mint a slug if switching to unlisted and there isn't one yet.
                if (input.privacy === "unlisted" && !playlist.unlistedSlug) {
                    patch.unlistedSlug = unlistedSlug();
                }
                // Clear the slug if moving away from unlisted.
                if (input.privacy !== "unlisted") {
                    patch.unlistedSlug = null;
                }
            }

            const [updated] = await ctx.db
                .update(playlists)
                .set(patch)
                .where(eq(playlists.id, input.id))
                .returning();

            return updated;
        }),

    // -------------------------------------------------------------------------
    // Protected: delete a user-kind playlist (owner only, system kinds rejected)
    // -------------------------------------------------------------------------
    delete: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const playlist = await ctx.db
                .select({ id: playlists.id, ownerId: playlists.ownerId, kind: playlists.kind })
                .from(playlists)
                .where(eq(playlists.id, input.id))
                .limit(1)
                .then((r) => r[0]);

            if (!playlist) throw new TRPCError({ code: "NOT_FOUND", message: "Playlist not found." });
            if (playlist.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
            if (playlist.kind !== "user") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "System playlists cannot be deleted." });
            }

            await ctx.db.delete(playlists).where(eq(playlists.id, input.id));
            return { id: input.id };
        }),

    // -------------------------------------------------------------------------
    // Protected: add a video to a playlist (owner only)
    // -------------------------------------------------------------------------
    addItem: protectedProcedure
        .input(z.object({ playlistId: z.string().uuid(), videoId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const playlist = await ctx.db
                .select({ id: playlists.id, ownerId: playlists.ownerId })
                .from(playlists)
                .where(eq(playlists.id, input.playlistId))
                .limit(1)
                .then((r) => r[0]);

            if (!playlist) throw new TRPCError({ code: "NOT_FOUND", message: "Playlist not found." });
            if (playlist.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

            // Compute position atomically using INSERT ... SELECT.
            const [result] = await ctx.db
                .select({ maxPos: max(playlistItems.position) })
                .from(playlistItems)
                .where(eq(playlistItems.playlistId, input.playlistId));
            const nextPos = (result?.maxPos ?? -1) + 1;

            const [item] = await ctx.db
                .insert(playlistItems)
                .values({ playlistId: input.playlistId, videoId: input.videoId, position: nextPos })
                .returning();

            return item;
        }),

    // -------------------------------------------------------------------------
    // Protected: remove an item from a playlist (owner only)
    // -------------------------------------------------------------------------
    removeItem: protectedProcedure
        .input(z.object({ itemId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify ownership via join.
            const item = await ctx.db
                .select({ id: playlistItems.id, playlistId: playlistItems.playlistId })
                .from(playlistItems)
                .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
                .where(and(eq(playlistItems.id, input.itemId), eq(playlists.ownerId, ctx.user.id)))
                .limit(1)
                .then((r) => r[0]);

            if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found or you do not own this playlist." });

            await ctx.db.delete(playlistItems).where(eq(playlistItems.id, input.itemId));
            return { id: input.itemId };
        }),

    // -------------------------------------------------------------------------
    // Protected: reorder items in a playlist (owner only)
    // Two-pass strategy: set positions to negative offsets then to final values,
    // avoiding the unique (playlistId, position) constraint violation.
    // -------------------------------------------------------------------------
    reorder: protectedProcedure
        .input(z.object({ playlistId: z.string().uuid(), itemIds: z.array(z.string().uuid()) }))
        .mutation(async ({ ctx, input }) => {
            const playlist = await ctx.db
                .select({ id: playlists.id, ownerId: playlists.ownerId })
                .from(playlists)
                .where(eq(playlists.id, input.playlistId))
                .limit(1)
                .then((r) => r[0]);

            if (!playlist) throw new TRPCError({ code: "NOT_FOUND" });
            if (playlist.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

            await ctx.db.transaction(async (tx) => {
                // Pass 1: set all positions to unique negative sentinel values
                // (-(index + 1)) so we vacate the positive slots without conflicts.
                for (let i = 0; i < input.itemIds.length; i++) {
                    await tx
                        .update(playlistItems)
                        .set({ position: -(i + 1) })
                        .where(
                            and(
                                eq(playlistItems.id, input.itemIds[i]!),
                                eq(playlistItems.playlistId, input.playlistId),
                            ),
                        );
                }
                // Pass 2: set final positive positions.
                for (let i = 0; i < input.itemIds.length; i++) {
                    await tx
                        .update(playlistItems)
                        .set({ position: i })
                        .where(
                            and(
                                eq(playlistItems.id, input.itemIds[i]!),
                                eq(playlistItems.playlistId, input.playlistId),
                            ),
                        );
                }
            });

            return { ok: true };
        }),

    // -------------------------------------------------------------------------
    // Sub-namespaces
    // -------------------------------------------------------------------------
    queue: queueRouter,
    watchLater: watchLaterRouter,
});
