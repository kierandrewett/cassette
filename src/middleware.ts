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

const hasSessionCookie = (req: NextRequest): boolean => COOKIE_NAMES.some((name) => req.cookies.get(name)?.value);

export async function middleware(req: NextRequest): Promise<NextResponse> {
    const { pathname } = req.nextUrl;

    // Back-compat: the public channel route was /c/<handle>; it's now
    // /channel/<handle>. Permanent-redirect any /c/... so old bookmarks,
    // RSS subscribers, and the like keep working. We do this BEFORE the
    // always-allowed check so the redirect always fires regardless of
    // privacy mode. Note this only covers the public surface; the studio
    // path /studio/c/... was renamed to /studio/channel/... in the same
    // commit and is not redirected — it's an authenticated UI and old
    // bookmarks should just hit a 404 if anyone has them.
    if (pathname === "/c" || pathname.startsWith("/c/")) {
        const target = req.nextUrl.clone();
        target.pathname = "/channel" + pathname.slice(2);
        return NextResponse.redirect(target, 308);
    }

    // Cheap pathname checks come first: any always-allowed route exits the
    // middleware without touching the privacy-mode DB query at all. This is
    // what was making /api/auth/get-session sit on a 5s artificial delay —
    // every cold request was awaiting a Postgres round-trip from the
    // middleware bundle before doing anything else.
    if (isAlwaysAllowed(pathname)) {
        return NextResponse.next();
    }

    // Authenticated viewers always pass through. We resolve the cookie
    // before consulting site privacy mode so the common signed-in case
    // never pays the DB hit.
    if (hasSessionCookie(req)) {
        return NextResponse.next();
    }

    // Anonymous viewer on a non-allowed path. Now we need to know whether
    // the site is public, login-required, or login-only. The lookup is
    // memoised in-process for 30 s.
    const mode = await getPrivacyMode();

    if (mode === "public") {
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
