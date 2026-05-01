// @ts-check

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
    "img-src 'self' data: https://www.libravatar.org https://www.gravatar.com",
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
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
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
    images: {
        remotePatterns: [],
    },
    // Required so Drizzle's pg dialect and pg-boss are not pulled into
    // the edge bundle. Both pin to Node-only APIs.
    serverExternalPackages: ["pg", "pg-boss", "pg-connection-string", "pgpass", "postgres", "busboy"],

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
                        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
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

export default nextConfig;
