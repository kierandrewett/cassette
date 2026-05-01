import { type NextRequest, NextResponse } from "next/server";

import { getPrivacyMode } from "@/lib/site-config";

// ---------------------------------------------------------------------------
// Paths that are always accessible without authentication.
// ---------------------------------------------------------------------------

const AUTH_PATHS = ["/login", "/forgot-password", "/reset-password"];

const isAlwaysAllowed = (pathname: string): boolean => {
    if (pathname.startsWith("/_next/")) return true;
    if (pathname === "/favicon.svg" || pathname === "/favicon.ico") return true;

    if (pathname.startsWith("/api/auth/")) return true;
    if (pathname === "/api/health") return true;
    if (pathname.startsWith("/api/trpc/health.")) return true;

    if (AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;

    // /register stays through the matcher; the page itself calls notFound()
    // when mode === "login-only".
    if (pathname === "/register" || pathname.startsWith("/register/")) return true;

    return false;
};

// Edge-runtime-safe session presence check. We deliberately do NOT import the
// full Better-Auth instance here because:
//   1. Better-Auth's passkey + 2FA plugins use dynamic code evaluation that
//      the Edge runtime forbids.
//   2. Importing `@/lib/auth` here would pull pg + drizzle + Node-only
//      modules into the middleware bundle.
//
// Better-Auth's session cookie is HTTP-only with a stable name. Cookie
// presence is enough to keep anonymous viewers off the protected surface;
// the actual session validation still happens in the server components and
// route handlers downstream, which run on Node and have full auth access.
const COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

const hasSessionCookie = (req: NextRequest): boolean =>
    COOKIE_NAMES.some((name) => req.cookies.get(name)?.value);

export async function middleware(req: NextRequest): Promise<NextResponse> {
    const { pathname } = req.nextUrl;

    const mode = await getPrivacyMode();

    if (mode === "public") {
        return NextResponse.next();
    }

    if (isAlwaysAllowed(pathname)) {
        return NextResponse.next();
    }

    if (hasSessionCookie(req)) {
        return NextResponse.next();
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: [
        /*
         * Match all request paths EXCEPT:
         * - _next/static (static files)
         * - _next/image  (image optimisation)
         * - public assets with a file extension (png, jpg, svg, etc.)
         */
        "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|eot|css|js|map)$).*)",
    ],
};
