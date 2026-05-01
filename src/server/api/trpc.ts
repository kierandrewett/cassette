import { initTRPC, TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channelMembers, type ChannelRole } from "@/server/db/schema/channels";
import { adminGrants } from "@/server/db/schema/admin";

export type CreateContextOptions = {
    headers: Headers;
};

export const createTRPCContext = async (opts: CreateContextOptions) => {
    const session = await auth.api.getSession({ headers: opts.headers }).catch(() => null);
    return {
        db,
        headers: opts.headers,
        session,
        user: session?.user ?? null,
    };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
    transformer: superjson,
    errorFormatter: ({ shape, error }) => ({
        ...shape,
        data: {
            ...shape.data,
            zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        },
    }),
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const mergeRouters = t.mergeRouters;
export const middleware = t.middleware;

export const publicProcedure = t.procedure;

const sessionRequired = middleware(({ ctx, next }) => {
    if (!ctx.user || !ctx.session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
        ctx: {
            ...ctx,
            user: ctx.user,
            session: ctx.session,
        },
    });
});

export const protectedProcedure = t.procedure.use(sessionRequired);

// adminProcedure: requires a session AND that the caller has a row in admin_grants.
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
    const rows = await ctx.db
        .select({ userId: adminGrants.userId })
        .from(adminGrants)
        .where(eq(adminGrants.userId, ctx.user.id))
        .limit(1);
    if (!rows[0]) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
    }
    return next({ ctx });
});

// channelProcedure: requires a session AND that the caller is a member of the
// channel referenced by `input.channelId` with at least the given role.
export const channelProcedure = (...allowedRoles: ChannelRole[]) =>
    protectedProcedure.use(async ({ ctx, next, getRawInput }) => {
        const raw = await getRawInput();
        const channelId = (raw as { channelId?: unknown })?.channelId;
        if (typeof channelId !== "string") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "channelId required" });
        }
        const rows = await ctx.db
            .select({ role: channelMembers.role })
            .from(channelMembers)
            .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, ctx.user.id)))
            .limit(1);
        const member = rows[0];
        if (!member) {
            throw new TRPCError({ code: "FORBIDDEN", message: "not a member of this channel" });
        }
        if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
            throw new TRPCError({ code: "FORBIDDEN", message: `role '${member.role}' not permitted` });
        }
        return next({
            ctx: {
                ...ctx,
                channelId,
                channelRole: member.role,
            },
        });
    });
