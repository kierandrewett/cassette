import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { channels } from "@/server/db/schema/channels";
import { watchProgress } from "@/server/db/schema/history";
import { subscriptions } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const subscribeInput = z.object({
    channelId: z.string().uuid(),
    notify: z.boolean().default(true),
});

const unsubscribeInput = z.object({ channelId: z.string().uuid() });

const setNotifyInput = z.object({
    channelId: z.string().uuid(),
    notify: z.boolean(),
});

const listMineInput = z.object({
    cursor: z.string().uuid().nullish(),
    limit: z.number().int().min(1).max(100).default(30),
});

const feedInput = z.object({
    cursor: z.string().uuid().nullish(),
    limit: z.number().int().min(1).max(100).default(30),
});

const isSubscribedInput = z.object({ channelId: z.string().uuid() });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const subscriptionRouter = createTRPCRouter({
    // Protected: subscribe (or update notify flag if already subscribed).
    subscribe: protectedProcedure.input(subscribeInput).mutation(async ({ ctx, input }) => {
        // Verify the channel exists.
        const channel = await ctx.db
            .select({ id: channels.id })
            .from(channels)
            .where(eq(channels.id, input.channelId))
            .limit(1);

        if (!channel[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
        }

        await ctx.db
            .insert(subscriptions)
            .values({
                userId: ctx.user.id,
                channelId: input.channelId,
                notify: input.notify,
            })
            .onConflictDoUpdate({
                target: [subscriptions.userId, subscriptions.channelId],
                set: { notify: input.notify },
            });

        return { subscribed: true };
    }),

    // Protected: remove a subscription.
    unsubscribe: protectedProcedure.input(unsubscribeInput).mutation(async ({ ctx, input }) => {
        await ctx.db
            .delete(subscriptions)
            .where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.channelId, input.channelId)));

        return { subscribed: false };
    }),

    // Protected: update the notification preference for an existing subscription.
    setNotify: protectedProcedure.input(setNotifyInput).mutation(async ({ ctx, input }) => {
        const result = await ctx.db
            .update(subscriptions)
            .set({ notify: input.notify })
            .where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.channelId, input.channelId)))
            .returning({ channelId: subscriptions.channelId });

        if (!result[0]) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found." });
        }

        return { notify: input.notify };
    }),

    // Protected: list subscribed channels, newest first.
    listMine: protectedProcedure.input(listMineInput).query(async ({ ctx, input }) => {
        const { cursor, limit } = input;

        const conditions = [eq(subscriptions.userId, ctx.user.id)];

        if (cursor) {
            const cursorRows = await ctx.db
                .select({ createdAt: subscriptions.createdAt })
                .from(subscriptions)
                .where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.channelId, cursor)))
                .limit(1);
            const cursorRow = cursorRows[0];
            if (cursorRow) {
                conditions.push(lt(subscriptions.createdAt, cursorRow.createdAt));
            }
        }

        const rows = await ctx.db
            .select({
                channelId: subscriptions.channelId,
                notify: subscriptions.notify,
                subscribedAt: subscriptions.createdAt,
                handle: channels.handle,
                name: channels.name,
                avatarPath: channels.avatarPath,
                description: channels.description,
            })
            .from(subscriptions)
            .innerJoin(channels, eq(subscriptions.channelId, channels.id))
            .where(and(...conditions))
            .orderBy(desc(subscriptions.createdAt))
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);

        return {
            items,
            nextCursor: hasMore ? (items[items.length - 1]?.channelId ?? null) : null,
        };
    }),

    // Protected: subscription feed — public ready videos from subscribed channels.
    feed: protectedProcedure.input(feedInput).query(async ({ ctx, input }) => {
        const { cursor, limit } = input;

        // Collect the caller's subscribed channel ids.
        const subRows = await ctx.db
            .select({ channelId: subscriptions.channelId })
            .from(subscriptions)
            .where(eq(subscriptions.userId, ctx.user.id));

        if (subRows.length === 0) {
            return { items: [], nextCursor: null };
        }

        const channelIds = subRows.map((r) => r.channelId);

        const conditions = [
            inArray(videos.channelId, channelIds),
            eq(videos.privacy, "public"),
            eq(videos.status, "ready"),
            sql`${videos.publishedAt} IS NOT NULL`,
        ];

        if (cursor) {
            const cursorRows = await ctx.db
                .select({ publishedAt: videos.publishedAt })
                .from(videos)
                .where(eq(videos.id, cursor))
                .limit(1);
            const cursorRow = cursorRows[0];
            if (cursorRow?.publishedAt) {
                conditions.push(lt(videos.publishedAt, cursorRow.publishedAt));
            }
        }

        const rows = await ctx.db
            .select({
                id: videos.id,
                title: videos.title,
                channelId: videos.channelId,
                thumbnailPath: videos.thumbnailPath,
                durationSec: videos.durationSec,
                viewCount: videos.viewCount,
                publishedAt: videos.publishedAt,
                channelHandle: channels.handle,
                channelName: channels.name,
                channelAvatarPath: channels.avatarPath,
            })
            .from(videos)
            .innerJoin(channels, eq(videos.channelId, channels.id))
            .where(and(...conditions))
            .orderBy(desc(videos.publishedAt))
            .limit(limit + 1);

        // Attach watchProgress for the caller.
        const videoIds = rows.slice(0, limit).map((r) => r.id);
        let progressMap = new Map<string, { positionSec: number; durationSec: number; completed: boolean }>();
        if (videoIds.length > 0) {
            const progress = await ctx.db
                .select({
                    videoId: watchProgress.videoId,
                    positionSec: watchProgress.positionSec,
                    durationSec: watchProgress.durationSec,
                    completed: watchProgress.completed,
                })
                .from(watchProgress)
                .where(and(eq(watchProgress.userId, ctx.user.id), inArray(watchProgress.videoId, videoIds)));

            progressMap = new Map(progress.map((p) => [p.videoId, p]));
        }

        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map((r) => ({
            ...r,
            watchProgress: progressMap.get(r.id) ?? null,
        }));

        return {
            items,
            nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
        };
    }),

    // Public (returns false when unauthenticated): check subscription status.
    isSubscribed: publicProcedure.input(isSubscribedInput).query(async ({ ctx, input }) => {
        if (!ctx.user) return false;

        const rows = await ctx.db
            .select({ channelId: subscriptions.channelId })
            .from(subscriptions)
            .where(and(eq(subscriptions.userId, ctx.user.id), eq(subscriptions.channelId, input.channelId)))
            .limit(1);

        return rows.length > 0;
    }),
});
