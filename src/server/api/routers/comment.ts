import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import type { Database } from "@/server/db/client";
import { channelMembers } from "@/server/db/schema/channels";
import { commentLikes, comments } from "@/server/db/schema/social";
import type { ReactionKind } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";
import { user } from "@/server/db/schema/auth";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Load a comment or throw NOT_FOUND. */
async function loadComment(db: Database, id: string) {
    const rows = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found." });
    return row;
}

/**
 * Resolve the channel that owns a video, then check whether the given userId
 * is a member with owner or manager role.
 */
async function isChannelManagerForVideo(
    db: Database,
    videoId: string,
    userId: string,
): Promise<boolean> {
    const videoRows = await db
        .select({ channelId: videos.channelId })
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);
    const video = videoRows[0];
    if (!video) return false;

    const memberRows = await db
        .select({ role: channelMembers.role })
        .from(channelMembers)
        .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, userId)))
        .limit(1);

    const member = memberRows[0];
    return member?.role === "owner" || member?.role === "manager";
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const listInput = z.object({
    videoId: z.string().uuid(),
    cursor: z.string().uuid().nullish(),
    limit: z.number().int().min(1).max(100).default(20),
});

const listRepliesInput = z.object({
    rootId: z.string().uuid(),
    cursor: z.string().uuid().nullish(),
    limit: z.number().int().min(1).max(100).default(50),
});

const createInput = z.object({
    videoId: z.string().uuid(),
    body: z.string().max(5000),
    parentId: z.string().uuid().nullish(),
});

const updateInput = z.object({
    id: z.string().uuid(),
    body: z.string().max(5000),
});

const softDeleteInput = z.object({ id: z.string().uuid() });
const pinInput = z.object({ id: z.string().uuid(), pinned: z.boolean() });
const heartInput = z.object({ id: z.string().uuid(), hearted: z.boolean() });
const likeInput = z.object({ id: z.string().uuid() });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const commentRouter = createTRPCRouter({
    // Public: top-level comments for a video, paginated (pinned first, then newest).
    list: publicProcedure.input(listInput).query(async ({ ctx, input }) => {
        const { videoId, cursor, limit } = input;
        const userId = ctx.user?.id ?? null;

        // Build conditions: top-level only (parentId IS NULL), not deleted,
        // matching video. When a cursor is provided we want the next page.
        // Because we order by (isPinned DESC, createdAt DESC) we use the id
        // cursor: fetch rows where createdAt < cursor row's createdAt (simple
        // keyset). Pinned rows are always in the first page only — this is an
        // acceptable simplification consistent with YouTube's behaviour.
        const conditions = [eq(comments.videoId, videoId), isNull(comments.parentId), isNull(comments.deletedAt)];

        if (cursor) {
            // Fetch the cursor row to get its timestamp for keyset pagination.
            const cursorRows = await ctx.db
                .select({ createdAt: comments.createdAt, isPinned: comments.isPinned })
                .from(comments)
                .where(eq(comments.id, cursor))
                .limit(1);
            const cursorRow = cursorRows[0];
            if (cursorRow) {
                // After the cursor: not pinned (pinned are always first-page),
                // and created before the cursor row.
                conditions.push(lt(comments.createdAt, cursorRow.createdAt));
            }
        }

        const rows = await ctx.db
            .select({
                id: comments.id,
                videoId: comments.videoId,
                parentId: comments.parentId,
                rootId: comments.rootId,
                body: comments.body,
                isPinned: comments.isPinned,
                isHearted: comments.isHearted,
                editedAt: comments.editedAt,
                likeCount: comments.likeCount,
                dislikeCount: comments.dislikeCount,
                createdAt: comments.createdAt,
                authorId: comments.authorId,
                authorName: user.name,
                authorImage: user.image,
            })
            .from(comments)
            .leftJoin(user, eq(comments.authorId, user.id))
            .where(and(...conditions))
            .orderBy(desc(comments.isPinned), desc(comments.createdAt))
            .limit(limit + 1);

        // Attach reactionByMe for authenticated callers.
        let reactionMap = new Map<string, "like" | "dislike">();
        if (userId && rows.length > 0) {
            const ids = rows.map((r) => r.id);
            const reactions = await ctx.db
                .select({ commentId: commentLikes.commentId, kind: commentLikes.kind })
                .from(commentLikes)
                .where(
                    and(
                        eq(commentLikes.userId, userId),
                        sql`${commentLikes.commentId} = ANY(${sql.raw("ARRAY[" + ids.map((id) => `'${id}'`).join(",") + "]::uuid[]")})`,
                    ),
                );
            reactionMap = new Map(reactions.map((r) => [r.commentId, r.kind]));
        }

        // Get reply counts for top-level comments.
        let replyCountMap = new Map<string, number>();
        if (rows.length > 0) {
            const topLevelIds = rows.map((r) => r.id);
            const replyCounts = await ctx.db
                .select({
                    rootId: comments.rootId,
                    count: sql<number>`cast(count(*) as int)`,
                })
                .from(comments)
                .where(
                    and(
                        sql`${comments.rootId} = ANY(${sql.raw("ARRAY[" + topLevelIds.map((id) => `'${id}'`).join(",") + "]::uuid[]")})`,
                        isNull(comments.deletedAt),
                        sql`${comments.parentId} IS NOT NULL`,
                    ),
                )
                .groupBy(comments.rootId);

            replyCountMap = new Map(replyCounts.map((r) => [r.rootId!, r.count]));
        }

        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map((r) => ({
            id: r.id,
            videoId: r.videoId,
            parentId: r.parentId,
            rootId: r.rootId,
            body: r.body,
            isPinned: r.isPinned,
            isHearted: r.isHearted,
            editedAt: r.editedAt,
            likeCount: r.likeCount,
            dislikeCount: r.dislikeCount,
            createdAt: r.createdAt,
            replyCount: replyCountMap.get(r.id) ?? 0,
            reactionByMe: (reactionMap.get(r.id) ?? null) as "like" | "dislike" | null,
            author: {
                id: r.authorId,
                name: r.authorName,
                image: r.authorImage,
            },
        }));

        return {
            items,
            nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
        };
    }),

    // Public: replies under a root comment, paginated oldest-first.
    listReplies: publicProcedure.input(listRepliesInput).query(async ({ ctx, input }) => {
        const { rootId, cursor, limit } = input;
        const userId = ctx.user?.id ?? null;

        const conditions = [eq(comments.rootId, rootId), sql`${comments.parentId} IS NOT NULL`, isNull(comments.deletedAt)];

        if (cursor) {
            const cursorRows = await ctx.db
                .select({ createdAt: comments.createdAt })
                .from(comments)
                .where(eq(comments.id, cursor))
                .limit(1);
            const cursorRow = cursorRows[0];
            if (cursorRow) {
                conditions.push(gt(comments.createdAt, cursorRow.createdAt));
            }
        }

        const rows = await ctx.db
            .select({
                id: comments.id,
                videoId: comments.videoId,
                parentId: comments.parentId,
                rootId: comments.rootId,
                body: comments.body,
                isPinned: comments.isPinned,
                isHearted: comments.isHearted,
                editedAt: comments.editedAt,
                likeCount: comments.likeCount,
                dislikeCount: comments.dislikeCount,
                createdAt: comments.createdAt,
                authorId: comments.authorId,
                authorName: user.name,
                authorImage: user.image,
            })
            .from(comments)
            .leftJoin(user, eq(comments.authorId, user.id))
            .where(and(...conditions))
            .orderBy(asc(comments.createdAt))
            .limit(limit + 1);

        let reactionMap = new Map<string, "like" | "dislike">();
        if (userId && rows.length > 0) {
            const ids = rows.map((r) => r.id);
            const reactions = await ctx.db
                .select({ commentId: commentLikes.commentId, kind: commentLikes.kind })
                .from(commentLikes)
                .where(
                    and(
                        eq(commentLikes.userId, userId),
                        sql`${commentLikes.commentId} = ANY(${sql.raw("ARRAY[" + ids.map((id) => `'${id}'`).join(",") + "]::uuid[]")})`,
                    ),
                );
            reactionMap = new Map(reactions.map((r) => [r.commentId, r.kind]));
        }

        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit).map((r) => ({
            id: r.id,
            videoId: r.videoId,
            parentId: r.parentId,
            rootId: r.rootId,
            body: r.body,
            isPinned: r.isPinned,
            isHearted: r.isHearted,
            editedAt: r.editedAt,
            likeCount: r.likeCount,
            dislikeCount: r.dislikeCount,
            createdAt: r.createdAt,
            replyCount: 0,
            reactionByMe: (reactionMap.get(r.id) ?? null) as "like" | "dislike" | null,
            author: {
                id: r.authorId,
                name: r.authorName,
                image: r.authorImage,
            },
        }));

        return {
            items,
            nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
        };
    }),

    // Protected: create a new comment or reply.
    create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
        const body = input.body.trim();
        if (body.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body cannot be empty." });
        if (body.length > 5000) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body must be 5000 characters or fewer." });

        if (input.parentId) {
            // Reply path: enforce depth cap.
            const parent = await loadComment(ctx.db, input.parentId);
            if (parent.parentId !== null) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Replies cannot be nested more than one level." });
            }
            const rootId = parent.rootId ?? parent.id;

            const inserted = await ctx.db
                .insert(comments)
                .values({
                    videoId: input.videoId,
                    authorId: ctx.user.id,
                    parentId: input.parentId,
                    rootId,
                    body,
                })
                .returning();

            return inserted[0]!;
        }

        // Top-level path: rootId must equal the new comment's own id.
        // Use a CTE with RETURNING so we can set rootId = id in one round-trip.
        const result = await ctx.db.execute(sql`
            WITH ins AS (
                INSERT INTO comments (video_id, author_id, body)
                VALUES (${input.videoId}::uuid, ${ctx.user.id}, ${body})
                RETURNING *
            )
            UPDATE comments
            SET root_id = ins.id
            FROM ins
            WHERE comments.id = ins.id
            RETURNING comments.*
        `);

        // postgres-js returns a RowList which is array-like.
        const rows = Array.from(result) as Array<Record<string, unknown>>;
        const row = rows[0];
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create comment." });
        // Map snake_case columns back to camelCase for the caller.
        return {
            id: row["id"] as string,
            videoId: row["video_id"] as string,
            authorId: (row["author_id"] as string | null) ?? null,
            parentId: (row["parent_id"] as string | null) ?? null,
            rootId: (row["root_id"] as string | null) ?? null,
            body: row["body"] as string,
            isPinned: (row["is_pinned"] as boolean) ?? false,
            isHearted: (row["is_hearted"] as boolean) ?? false,
            editedAt: (row["edited_at"] as Date | null) ?? null,
            deletedAt: (row["deleted_at"] as Date | null) ?? null,
            likeCount: (row["like_count"] as number) ?? 0,
            dislikeCount: (row["dislike_count"] as number) ?? 0,
            createdAt: row["created_at"] as Date,
        } satisfies typeof comments.$inferSelect;
    }),

    // Protected: edit own comment within 15-minute window.
    update: protectedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
        const body = input.body.trim();
        if (body.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body cannot be empty." });
        if (body.length > 5000) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body must be 5000 characters or fewer." });

        const comment = await loadComment(ctx.db, input.id);

        if (comment.authorId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own comments." });
        }

        const ageMs = Date.now() - comment.createdAt.getTime();
        if (ageMs > 15 * 60 * 1000) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Comments can only be edited within 15 minutes of posting." });
        }

        const updated = await ctx.db
            .update(comments)
            .set({ body, editedAt: new Date() })
            .where(eq(comments.id, input.id))
            .returning();

        return updated[0]!;
    }),

    // Protected: soft-delete. Author or channel owner/manager.
    softDelete: protectedProcedure.input(softDeleteInput).mutation(async ({ ctx, input }) => {
        const comment = await loadComment(ctx.db, input.id);

        const isAuthor = comment.authorId === ctx.user.id;
        const isManager = !isAuthor && (await isChannelManagerForVideo(ctx.db, comment.videoId, ctx.user.id));

        if (!isAuthor && !isManager) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to delete this comment." });
        }

        const updated = await ctx.db
            .update(comments)
            .set({ deletedAt: new Date(), body: "[deleted]" })
            .where(eq(comments.id, input.id))
            .returning();

        return updated[0]!;
    }),

    // Protected: pin/unpin. Channel owner or manager only.
    pin: protectedProcedure.input(pinInput).mutation(async ({ ctx, input }) => {
        const comment = await loadComment(ctx.db, input.id);

        const isManager = await isChannelManagerForVideo(ctx.db, comment.videoId, ctx.user.id);
        if (!isManager) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Only channel owners and managers can pin comments." });
        }

        const updated = await ctx.db
            .update(comments)
            .set({ isPinned: input.pinned })
            .where(eq(comments.id, input.id))
            .returning();

        return updated[0]!;
    }),

    // Protected: heart/unheart. Channel owner or manager only.
    heart: protectedProcedure.input(heartInput).mutation(async ({ ctx, input }) => {
        const comment = await loadComment(ctx.db, input.id);

        const isManager = await isChannelManagerForVideo(ctx.db, comment.videoId, ctx.user.id);
        if (!isManager) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Only channel owners and managers can heart comments." });
        }

        const updated = await ctx.db
            .update(comments)
            .set({ isHearted: input.hearted })
            .where(eq(comments.id, input.id))
            .returning();

        return updated[0]!;
    }),

    // Protected: toggle like on a comment.
    like: protectedProcedure.input(likeInput).mutation(async ({ ctx, input }) => {
        return toggleCommentReaction(ctx.db, input.id, ctx.user.id, "like");
    }),

    // Protected: toggle dislike on a comment.
    dislike: protectedProcedure.input(likeInput).mutation(async ({ ctx, input }) => {
        return toggleCommentReaction(ctx.db, input.id, ctx.user.id, "dislike");
    }),
});

// ---------------------------------------------------------------------------
// Reaction toggle (shared between like + dislike)
// ---------------------------------------------------------------------------

async function toggleCommentReaction(
    db: Database,
    commentId: string,
    userId: string,
    kind: ReactionKind,
) {
    // Load existing reaction in the same transaction.
    return db.transaction(async (tx) => {
        const existing = await tx
            .select({ kind: commentLikes.kind })
            .from(commentLikes)
            .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)))
            .limit(1);

        const prev = existing[0];

        if (prev?.kind === kind) {
            // Same kind — remove the reaction.
            await tx.delete(commentLikes).where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));

            await tx
                .update(comments)
                .set(
                    kind === "like"
                        ? { likeCount: sql`${comments.likeCount} - 1` }
                        : { dislikeCount: sql`${comments.dislikeCount} - 1` },
                )
                .where(eq(comments.id, commentId));

            return { reactionByMe: null as null };
        }

        if (prev) {
            // Opposite kind — swap.
            await tx
                .update(commentLikes)
                .set({ kind })
                .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));

            const delta =
                kind === "like"
                    ? { likeCount: sql`${comments.likeCount} + 1`, dislikeCount: sql`${comments.dislikeCount} - 1` }
                    : { likeCount: sql`${comments.likeCount} - 1`, dislikeCount: sql`${comments.dislikeCount} + 1` };

            await tx.update(comments).set(delta).where(eq(comments.id, commentId));
        } else {
            // No prior reaction — insert.
            await tx.insert(commentLikes).values({ userId, commentId, kind });

            await tx
                .update(comments)
                .set(
                    kind === "like"
                        ? { likeCount: sql`${comments.likeCount} + 1` }
                        : { dislikeCount: sql`${comments.dislikeCount} + 1` },
                )
                .where(eq(comments.id, commentId));
        }

        return { reactionByMe: kind };
    });
}
