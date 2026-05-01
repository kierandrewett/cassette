import { createCallerFactory, createTRPCRouter, publicProcedure } from "./trpc";
import { channelRouter } from "./routers";

// The application router. Sub-routers are added by the per-milestone agents
// as they land. `health.ping` exists from the start so the wire shape is real
// even before any feature routers register.

export const appRouter = createTRPCRouter({
    health: createTRPCRouter({
        ping: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
    }),
    channel: channelRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
