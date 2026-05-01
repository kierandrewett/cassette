import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { notifications } from "@/server/db/schema/notifications";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const cursorSchema = z
    .object({
        createdAt: z.coerce.date(),
        id: z.string().uuid(),
    })
    .optional();

export const notificationRouter = createTRPCRouter({
    // Paginated bell list. unreadOnly=true filters to read_at IS NULL.
    list: protectedProcedure
        .input(
            z.object({
                cursor: cursorSchema,
                limit: z.number().int().positive().max(50).default(20),
                unreadOnly: z.boolean().default(false),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { cursor, limit, unreadOnly } = input;

            const userFilter = eq(notifications.userId, ctx.user.id);
            const unreadFilter = unreadOnly ? isNull(notifications.readAt) : undefined;

            // Cursor on (createdAt, id) for stable pagination.
            const cursorFilter = cursor
                ? or(
                      lt(notifications.createdAt, cursor.createdAt),
                      and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)),
                  )
                : undefined;

            const where = and(userFilter, unreadFilter, cursorFilter);

            const rows = await ctx.db
                .select()
                .from(notifications)
                .where(where)
                .orderBy(desc(notifications.createdAt), desc(notifications.id))
                .limit(limit + 1);

            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            const last = items[items.length - 1];
            const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

            return { items, nextCursor };
        }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({ value: count() })
            .from(notifications)
            .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
        return rows[0]?.value ?? 0;
    }),

    markRead: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
        const result = await ctx.db
            .update(notifications)
            .set({ readAt: new Date() })
            .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)))
            .returning({ id: notifications.id });
        if (result.length === 0) {
            throw new TRPCError({ code: "NOT_FOUND" });
        }
        return { ok: true };
    }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
        const result = await ctx.db
            .update(notifications)
            .set({ readAt: new Date() })
            .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)))
            .returning({ id: notifications.id });
        return { count: result.length };
    }),
});
