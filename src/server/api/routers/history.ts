import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { channels } from "@/server/db/schema/channels";
import { watchHistory } from "@/server/db/schema/history";
import { videos } from "@/server/db/schema/videos";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const historyRouter = createTRPCRouter({
    /** Reverse-chronological watch history joined with video + channel data. */
    list: protectedProcedure
        .input(
            z.object({
                cursor: z.string().datetime().optional(),
                limit: z.number().int().min(1).max(200).optional().default(50),
            }),
        )
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select({
                    historyId: watchHistory.id,
                    watchedAt: watchHistory.watchedAt,
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
                .from(watchHistory)
                .innerJoin(videos, eq(videos.id, watchHistory.videoId))
                .innerJoin(channels, eq(channels.id, videos.channelId))
                .where(
                    input.cursor
                        ? and(
                              eq(watchHistory.userId, ctx.user.id),
                              lt(watchHistory.watchedAt, new Date(input.cursor)),
                          )
                        : eq(watchHistory.userId, ctx.user.id),
                )
                .orderBy(desc(watchHistory.watchedAt))
                .limit(input.limit);

            return {
                items: rows,
                nextCursor: rows.length === input.limit ? rows[rows.length - 1]!.watchedAt.toISOString() : undefined,
            };
        }),

    /** Delete all watch history for the caller. */
    clear: protectedProcedure.mutation(async ({ ctx }) => {
        await ctx.db.delete(watchHistory).where(eq(watchHistory.userId, ctx.user.id));
        return { ok: true };
    }),

    /** Delete a single watch history entry for a given video. */
    remove: protectedProcedure
        .input(z.object({ videoId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(watchHistory)
                .where(and(eq(watchHistory.userId, ctx.user.id), eq(watchHistory.videoId, input.videoId)));
            return { ok: true };
        }),
});
