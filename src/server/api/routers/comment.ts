import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import type { Database } from "@/server/db/client";
import { gravatarHash } from "@/lib/gravatar";
import { limit } from "@/lib/ratelimit";
import { channels, channelMembers } from "@/server/db/schema/channels";
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
 * Resolve a `userId -> primary channel handle` map for the given set of users.
 * "Primary" = most recently created channel they own. Users without an owned
 * channel are absent from the returned map. Used to render comment author
 * names as links to their channel page.
 */
async function loadAuthorChannelHandles(db: Database, userIds: ReadonlyArray<string>): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    // Filter out null/undefined deduped — leftJoin can produce nulls upstream.
    const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)));
    if (ids.length === 0) return new Map();

    const rows = await db
        .select({
            ownerId: channels.ownerId,
            handle: channels.handle,
            createdAt: channels.createdAt,
        })
        .from(channels)
        .where(inArray(channels.ownerId, ids))
        .orderBy(desc(channels.createdAt));

    // Drizzle results are ordered by createdAt desc — keep the first handle we
    // see per owner (which is the most recent).
    const out = new Map<string, string>();
    for (const r of rows) {
        if (!out.has(r.ownerId)) out.set(r.ownerId, r.handle);
    }
    return out;
}

/**
 * Resolve the channel that owns a video, then check whether the given userId
 * is a member with owner or manager role.
 */
async function isChannelManagerForVideo(db: Database, videoId: string, userId: string): Promise<boolean> {
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
                authorEmail: user.email,
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

        // Resolve each author's primary channel handle so the client can
        // render names as links to /c/<handle> without a second round trip.
        const handleMap = await loadAuthorChannelHandles(
            ctx.db,
            rows.map((r) => r.authorId).filter((id): id is string => !!id),
        );

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
                // Never ship the raw email to the client. We only forward the
                // md5 hash that Libravatar/Gravatar needs.
                gravatarHash: r.authorEmail ? gravatarHash(r.authorEmail) : null,
                channelHandle: r.authorId ? (handleMap.get(r.authorId) ?? null) : null,
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

        const conditions = [
            eq(comments.rootId, rootId),
            sql`${comments.parentId} IS NOT NULL`,
            isNull(comments.deletedAt),
        ];

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
                authorEmail: user.email,
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

        const handleMap = await loadAuthorChannelHandles(
            ctx.db,
            rows.map((r) => r.authorId).filter((id): id is string => !!id),
        );

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
                gravatarHash: r.authorEmail ? gravatarHash(r.authorEmail) : null,
                channelHandle: r.authorId ? (handleMap.get(r.authorId) ?? null) : null,
            },
        }));

        return {
            items,
            nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
        };
    }),

    // Protected: create a new comment or reply.
    create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
        // Rate limit: 30 comments/minute per user.
        const rl = limit({ key: "comment.create", identifier: ctx.user.id, windowMs: 60_000, max: 30 });
        if (!rl.allowed) {
            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: "You are posting comments too quickly. Please wait a moment.",
            });
        }

        const body = input.body.trim();
        if (body.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body cannot be empty." });
        if (body.length > 5000)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body must be 5000 characters or fewer." });

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

            const reply = inserted[0]!;

            // Best-effort fan-out: notify the parent author. Failures are
            // logged inside the helper, never thrown.
            const { notifyCommentReply } = await import("@/lib/notifications/fanout");
            void notifyCommentReply(reply.id);

            // Fire webhook fanout. Best-effort; void so failures never propagate.
            const { fanoutCommentEvent } = await import("@/lib/webhooks/fanout");
            void fanoutCommentEvent({ comment: reply });

            return reply;
        }

        // Top-level path: rootId must equal the new comment's own id. The
        // earlier CTE-and-update one-shot did not survive postgres-js's
        // RowList shape; two statements in a transaction are clear and just
        // as fast in practice. The transaction keeps rootId consistent.
        const inserted = await ctx.db.transaction(async (tx) => {
            const [row] = await tx
                .insert(comments)
                .values({
                    videoId: input.videoId,
                    authorId: ctx.user.id,
                    body,
                })
                .returning();
            if (!row) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create comment." });
            }
            const [updated] = await tx
                .update(comments)
                .set({ rootId: row.id })
                .where(eq(comments.id, row.id))
                .returning();
            return updated ?? { ...row, rootId: row.id };
        });

        // Fire webhook fanout for top-level comment. Best-effort.
        const { fanoutCommentEvent } = await import("@/lib/webhooks/fanout");
        void fanoutCommentEvent({ comment: inserted });

        return inserted;
    }),

    // Protected: edit own comment within 15-minute window.
    update: protectedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
        const body = input.body.trim();
        if (body.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body cannot be empty." });
        if (body.length > 5000)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body must be 5000 characters or fewer." });

        const comment = await loadComment(ctx.db, input.id);

        if (comment.authorId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own comments." });
        }

        const ageMs = Date.now() - comment.createdAt.getTime();
        if (ageMs > 15 * 60 * 1000) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "Comments can only be edited within 15 minutes of posting.",
            });
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

async function toggleCommentReaction(db: Database, commentId: string, userId: string, kind: ReactionKind) {
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
            await tx
                .delete(commentLikes)
                .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));

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
