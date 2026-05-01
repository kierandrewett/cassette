import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { reactionKind, videoLikes } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const toggleVideoInput = z.object({
    videoId: z.string().uuid(),
    kind: z.enum(reactionKind.enumValues),
});

const videoReactionInput = z.object({ videoId: z.string().uuid() });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const likeRouter = createTRPCRouter({
    // Protected: toggle a like or dislike on a video.
    // If the existing reaction matches the requested kind, remove it (toggle off).
    // If the opposite kind exists, swap.
    // If no reaction exists, insert.
    toggleVideo: protectedProcedure.input(toggleVideoInput).mutation(async ({ ctx, input }) => {
        const { videoId, kind } = input;
        const userId = ctx.user.id;

        return ctx.db.transaction(async (tx) => {
            const existing = await tx
                .select({ kind: videoLikes.kind })
                .from(videoLikes)
                .where(and(eq(videoLikes.userId, userId), eq(videoLikes.videoId, videoId)))
                .limit(1);

            const prev = existing[0];

            if (prev?.kind === kind) {
                // Same kind — toggle off.
                await tx.delete(videoLikes).where(and(eq(videoLikes.userId, userId), eq(videoLikes.videoId, videoId)));

                await tx
                    .update(videos)
                    .set(
                        kind === "like"
                            ? { likeCount: sql`${videos.likeCount} - 1` }
                            : { dislikeCount: sql`${videos.dislikeCount} - 1` },
                    )
                    .where(eq(videos.id, videoId));

                return { reactionByMe: null as null };
            }

            if (prev) {
                // Opposite kind — swap.
                await tx
                    .update(videoLikes)
                    .set({ kind })
                    .where(and(eq(videoLikes.userId, userId), eq(videoLikes.videoId, videoId)));

                const delta =
                    kind === "like"
                        ? { likeCount: sql`${videos.likeCount} + 1`, dislikeCount: sql`${videos.dislikeCount} - 1` }
                        : { likeCount: sql`${videos.likeCount} - 1`, dislikeCount: sql`${videos.dislikeCount} + 1` };

                await tx.update(videos).set(delta).where(eq(videos.id, videoId));
            } else {
                // No prior reaction — insert.
                await tx.insert(videoLikes).values({ userId, videoId, kind });

                await tx
                    .update(videos)
                    .set(
                        kind === "like"
                            ? { likeCount: sql`${videos.likeCount} + 1` }
                            : { dislikeCount: sql`${videos.dislikeCount} + 1` },
                    )
                    .where(eq(videos.id, videoId));
            }

            return { reactionByMe: kind };
        });
    }),

    // Protected: return the caller's current reaction on a video.
    videoReactionByMe: protectedProcedure.input(videoReactionInput).query(async ({ ctx, input }) => {
        const rows = await ctx.db
            .select({ kind: videoLikes.kind })
            .from(videoLikes)
            .where(and(eq(videoLikes.userId, ctx.user.id), eq(videoLikes.videoId, input.videoId)))
            .limit(1);

        return (rows[0]?.kind ?? null) as "like" | "dislike" | null;
    }),
});
