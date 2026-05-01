import { createCallerFactory, createTRPCRouter, publicProcedure } from "./trpc";
import {
    adminRouter,
    channelRouter,
    commentRouter,
    historyRouter,
    likeRouter,
    notificationRouter,
    playlistRouter,
    searchRouter,
    subscriptionRouter,
    videoRouter,
} from "./routers";

// The application router. Every domain router is registered here; the
// per-domain implementations live under ./routers/. `health.ping` is kept as
// a tiny no-auth procedure for liveness checks and as the canonical "is the
// tRPC wire shape live" probe.

export const appRouter = createTRPCRouter({
    health: createTRPCRouter({
        ping: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
    }),
    admin: adminRouter,
    channel: channelRouter,
    video: videoRouter,
    comment: commentRouter,
    subscription: subscriptionRouter,
    like: likeRouter,
    playlist: playlistRouter,
    history: historyRouter,
    search: searchRouter,
    notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
