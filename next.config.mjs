// @ts-check

import createNextIntlPlugin from "next-intl/plugin";

// next-intl wraps the Next config so the request-config loader resolves at
// build time. We point it at our shared request module rather than the
// default `./i18n/request.ts` because our path uses the `src/` root.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// ------------------------------------------------------------------
// Security headers
// ------------------------------------------------------------------
//
// Tight by default. Operators can override per-route via a reverse proxy
// (nginx / Caddy) — that always wins because Next is the inner server.
//
// Notes:
//  - `'unsafe-inline'` for script-src / style-src is required because Next
//    inlines a tiny bootstrap script and Tailwind ships some inline styles.
//    A nonce strategy is the right long-term answer; tracked in PLAN.
//  - HSTS is opt-in via `ENABLE_HSTS=1`. Setting it on a host that is not
//    actually behind HTTPS would lock browsers out of the site.
//  - The /embed/** route relaxes `frame-ancestors` to `*` so cassette
//    videos can be embedded on third-party sites. Operators who want to
//    further restrict (e.g. their company wiki only) should set CSP at
//    the proxy level for that path.
const CSP_DEFAULT = [
    "default-src 'self'",
    "media-src 'self' blob:",
    // https: lets channel-uploaded thumbnails (yt-dlp imports point at the
    // remote CDN) and any future image source resolve. Self + data: cover
    // local thumbnails and inline avatars.
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
].join("; ");

// /embed/** needs a relaxed CSP so it can render inside a third-party iframe.
// Everything else stays the same — only frame-ancestors changes.
const CSP_EMBED = CSP_DEFAULT.replace("frame-ancestors 'self'", "frame-ancestors *");

const baseSecurityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
    },
    // X-Frame-Options is superseded by CSP frame-ancestors but kept for
    // legacy clients (older Safari/Edge). The /embed/** override removes it.
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const enableHsts = process.env.ENABLE_HSTS === "1" || process.env.ENABLE_HSTS === "true";
const hstsHeader = enableHsts
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : [];

/** @type {import("next").NextConfig} */
const nextConfig = {
    output: "standalone",
    reactStrictMode: true,
    poweredByHeader: false,
    experimental: {
        serverActions: {
            bodySizeLimit: "20gb",
        },
    },
    devIndicators: false,
    images: {
        remotePatterns: [],
    },
    // Required so Drizzle's pg dialect and pg-boss are not pulled into
    // the edge bundle. Both pin to Node-only APIs.
    serverExternalPackages: [
        "pg",
        "pg-boss",
        "pg-connection-string",
        "pg-native",
        "pgpass",
        "postgres",
        "busboy",
        "nodemailer",
    ],

    // Turbopack handles Node externals natively via serverExternalPackages
    // above; this empty block exists so Next does not warn that webpack is
    // configured while Turbopack is not. When the webpack-only externals
    // shim below is no longer needed (i.e. once Turbopack ships full build
    // support and we drop the webpack(...) function), this block can stay
    // as the canonical place to add Turbopack-specific resolve aliases or
    // loader rules.
    turbopack: {},

    // /@<handle>/<rest> is the canonical user-facing channel URL. Next.js
    // doesn't allow a route directory starting with `@` (the symbol is
    // reserved for parallel-route slots), so the actual route lives at
    // /channel/<handle>/<rest> and we rewrite the @-prefixed URL to it on
    // the way in. The opposite direction (canonicalisation) is handled by
    // the redirects() entry below — visiting /channel/<handle> 308s to
    // /@<handle> so the URL bar always shows the @-form.
    async rewrites() {
        return [
            { source: "/@:handle", destination: "/channel/:handle" },
            { source: "/@:handle/:rest*", destination: "/channel/:handle/:rest*" },
        ];
    },

    async redirects() {
        return [
            { source: "/channel/:handle", destination: "/@:handle", permanent: true },
            { source: "/channel/:handle/:rest*", destination: "/@:handle/:rest*", permanent: true },
        ];
    },

    async headers() {
        return [
            {
                // Default profile — applies to every route.
                source: "/:path*",
                headers: [
                    ...baseSecurityHeaders,
                    ...hstsHeader,
                    { key: "Content-Security-Policy", value: CSP_DEFAULT },
                ],
            },
            {
                // Embed override — replaces the default CSP and drops
                // X-Frame-Options entirely so the iframe can render.
                source: "/embed/:path*",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                    ...hstsHeader,
                    { key: "Content-Security-Policy", value: CSP_EMBED },
                ],
            },
        ];
    },

    // Next.js 15's `serverExternalPackages` does not reach the
    // instrumentation bundle, so pg-boss + pg get statically analysed
    // through src/worker/boot.ts and explode on built-in Node modules
    // (fs/net/dns/stream/...). Mark them as commonjs externals so the
    // server build leaves them as `require()` lookups at runtime.
    webpack: (config, { isServer }) => {
        if (isServer) {
            const externals = Array.isArray(config.externals) ? config.externals : [];
            externals.push({
                pg: "commonjs pg",
                "pg-boss": "commonjs pg-boss",
                "pg-connection-string": "commonjs pg-connection-string",
                "pg-native": "commonjs pg-native",
                pgpass: "commonjs pgpass",
                postgres: "commonjs postgres",
                busboy: "commonjs busboy",
                nodemailer: "commonjs nodemailer",
            });
            config.externals = externals;
        }
        return config;
    },
};

// withNextIntl preserves every option above (including the security headers
// and the webpack tweaks for pg/pg-boss). It only injects the message-loader
// alias so server components can call `getTranslations()` without further
// boilerplate.
export default withNextIntl(nextConfig);
