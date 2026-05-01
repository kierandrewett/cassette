import { toNextJsHandler } from "better-auth/next-js";
import { type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { limit, ipFromHeaders } from "@/lib/ratelimit";
import { getPrivacyMode } from "@/lib/site-config";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth.handler);

export const { GET } = handlers;

export async function POST(req: NextRequest): Promise<Response> {
    // Block new registrations when the site is in login-only mode.
    if (req.nextUrl.pathname === "/api/auth/sign-up/email") {
        const mode = await getPrivacyMode();
        if (mode === "login-only") {
            return new Response(
                JSON.stringify({ error: "Registration is disabled. Please contact an administrator." }),
                { status: 403, headers: { "Content-Type": "application/json" } },
            );
        }
    }

    // Rate limit sign-in attempts: 10/minute per IP.
    const ip = ipFromHeaders(req.headers);
    const rl = limit({ key: "auth.signin", identifier: ip, windowMs: 60_000, max: 10 });
    if (!rl.allowed) {
        return new Response(
            JSON.stringify({ error: "Too many sign-in attempts. Please wait a moment before trying again." }),
            {
                status: 429,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)),
                },
            },
        );
    }

    return handlers.POST(req);
}
