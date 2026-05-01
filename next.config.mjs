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
    serverExternalPackages: ["pg", "pg-boss", "pg-connection-string", "pgpass", "postgres", "busboy"],

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
