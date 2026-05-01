import type { MetadataRoute } from "next";

// Next.js generates /manifest.webmanifest from this route. Keep the surface
// minimal — anything device/browser specific (apple-touch-icon etc.) belongs
// in <head> via metadata in layout.tsx, not here.
//
// Operators can drop in real PNG icons at public/icon-{192,512}.png; when
// absent the tags still resolve (Chrome treats 404s gracefully and falls back
// to the page favicon for the install prompt).
const manifest = (): MetadataRoute.Manifest => ({
    name: "cassette",
    short_name: "cassette",
    description: "A self-hosted, YouTube-shaped personal video platform.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: "#0a0a0c",
    background_color: "#000000",
    // Next.js' `MetadataRoute.Manifest` type only allows a single keyword per
    // `purpose`, so we duplicate the 512px icon to advertise both `any` and
    // `maskable` (Chrome treats the two entries identically to "any maskable").
    icons: [
        {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
        },
        {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
        },
        {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
        },
        {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
        },
    ],
});

export default manifest;
