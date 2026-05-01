import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

// createTRPCContext() reads Better-Auth's session from the incoming request
// headers. We memoize on the request boundary using React's `cache()` so that
// multiple RSC components calling `trpc.*` within the same render share one
// context creation and one DB session fetch.
const createContext = cache(async () => {
    const hdrs = await headers();
    return createTRPCContext({ headers: hdrs });
});

// Server-side tRPC caller. Use this in Server Components and route handlers
// where you do NOT want to go over the network.
//
// Usage:
//   import { trpc } from "@/lib/trpc/server";
//   const channels = await trpc.channel.listMine();
export const trpc = createCaller(createContext);
