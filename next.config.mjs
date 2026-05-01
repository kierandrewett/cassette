// @ts-check

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
    serverExternalPackages: ["pg", "pg-boss", "postgres", "busboy"],
};

export default nextConfig;
