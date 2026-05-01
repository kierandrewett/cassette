"use client";

import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/server/api/root";

// Typed React hooks and proxy client for use in Client Components.
export const api = createTRPCReact<AppRouter>();

const makeQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                // Prevent re-fetching immediately when a Server Component
                // streams while the query result is still fresh.
                staleTime: 60 * 1000,
            },
        },
    });

// Module-level singleton on the browser; avoids creating a new QueryClient on
// every React tree re-mount during development HMR.
let browserQueryClient: QueryClient | undefined = undefined;

const getQueryClient = (): QueryClient => {
    if (typeof window === "undefined") {
        // Server: always create a new client per request.
        return makeQueryClient();
    }
    // Browser: reuse the singleton.
    browserQueryClient ??= makeQueryClient();
    return browserQueryClient;
};

type TRPCProviderProps = {
    children: React.ReactNode;
};

export const TRPCProvider = ({ children }: TRPCProviderProps) => {
    const queryClient = getQueryClient();

    // `useState` so the tRPC client is created once per component lifecycle
    // rather than on every render. We avoid `useMemo` because React may discard
    // memo caches during concurrent rendering.
    const [trpcClient] = useState(() =>
        api.createClient({
            links: [
                httpBatchLink({
                    url: "/api/trpc",
                    transformer: superjson,
                    headers: () => ({
                        "x-trpc-source": "react",
                    }),
                }),
            ],
        }),
    );

    return (
        <api.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </api.Provider>
    );
};

// A vanilla (non-React) tRPC client for use in non-component contexts (e.g.
// router event handlers). Only usable on the client side.
export const vanillaTrpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
        }),
    ],
});
