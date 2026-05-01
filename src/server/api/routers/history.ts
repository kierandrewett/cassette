import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { channels } from "@/server/db/schema/channels";
import { watchHistory, watchProgress } from "@/server/db/schema/history";
import { videos } from "@/server/db/schema/videos";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const historyRouter = createTRPCRouter({
    /** Reverse-chronological watch history joined with video + channel data.
     *  When incompleteOnly is true, only entries that have a watchProgress row
     *  with completed=false are returned (i.e. videos started but not finished). */
    list: protectedProcedure
        .input(
            z.object({
                cursor: z.string().datetime().optional(),
                limit: z.number().int().min(1).max(200).optional().default(50),
                /** When true, return only videos with an incomplete watchProgress record. */
                incompleteOnly: z.boolean().optional().default(false),
            }),
        )
        .query(async ({ ctx, input }) => {
            const baseWhere = input.cursor
                ? and(
                      eq(watchHistory.userId, ctx.user.id),
                      lt(watchHistory.watchedAt, new Date(input.cursor)),
                  )
                : eq(watchHistory.userId, ctx.user.id);

            // When incompleteOnly is requested we INNER JOIN watchProgress and
            // add the completed=false predicate. The inner join implicitly drops
            // history rows that have no progress record at all (i.e. the beacon
            // never fired), which is the desired behaviour: if we don't know the
            // position we can't offer a "continue" resumption.
            const rows = input.incompleteOnly
                ? await ctx.db
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
                      .innerJoin(
                          watchProgress,
                          and(
                              eq(watchProgress.userId, watchHistory.userId),
                              eq(watchProgress.videoId, watchHistory.videoId),
                              eq(watchProgress.completed, false),
                          ),
                      )
                      .where(baseWhere)
                      .orderBy(desc(watchHistory.watchedAt))
                      .limit(input.limit)
                : await ctx.db
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
                      .where(baseWhere)
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
