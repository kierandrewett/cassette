import type { Metadata, Viewport } from "next";
import "./globals.css";

import { TRPCProvider } from "@/lib/trpc/client";
import { Providers } from "./providers";

// Inline script that runs before React hydration to apply the persisted theme,
// preventing a flash of the wrong colour scheme on load.
const THEME_SCRIPT = `
(function(){
    try {
        var t = localStorage.getItem('cassette.theme');
        var html = document.documentElement;
        if (t === 'light') {
            html.classList.remove('dark');
        } else if (t === 'dark') {
            html.classList.add('dark');
        } else {
            // 'system' or unset — follow OS preference.
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                html.classList.add('dark');
            } else {
                html.classList.remove('dark');
            }
        }
    } catch(e) {}
})();
`.trim();

// Service worker registration. Runs after the initial load so it never delays
// first paint. The SW itself is at /public/sw.js (root-scoped). We register
// only when the API is present; embeds and crawlers without service-worker
// support simply skip it.
const SW_SCRIPT = `
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(function(){});
    });
}
`.trim();

export const metadata: Metadata = {
    title: {
        default: "cassette",
        template: "%s · cassette",
    },
    description: "A self-hosted, YouTube-shaped personal video platform.",
    applicationName: "cassette",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
        capable: true,
        title: "cassette",
        statusBarStyle: "black-translucent",
    },
    icons: [
        { rel: "icon", url: "/favicon.svg" },
        { rel: "apple-touch-icon", url: "/icon-192.png" },
    ],
    alternates: {
        types: {
            "application/rss+xml": [{ url: "/feed.xml", title: "cassette · all uploads" }],
        },
    },
};

export const viewport: Viewport = {
    themeColor: "#000000",
    colorScheme: "dark light",
    width: "device-width",
    initialScale: 1,
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <head>
                {/* Apply persisted theme before first paint to avoid flash. */}
                {/* eslint-disable-next-line react/no-danger */}
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
                {/* Register the PWA service worker after `load` so it never
                    blocks first paint. The SW is a static asset at /sw.js. */}
                {/* eslint-disable-next-line react/no-danger */}
                <script dangerouslySetInnerHTML={{ __html: SW_SCRIPT }} />
                {/* Version tag for support / debug tooling. */}
                <meta name="data-cassette-version" content="0.1.0" />
            </head>
            <body className="min-h-full bg-background text-foreground antialiased">
                {/* Providers is the outermost client boundary; TRPCProvider sits inside it. */}
                <Providers>
                    <TRPCProvider>{children}</TRPCProvider>
                </Providers>
            </body>
        </html>
    );
};

export default RootLayout;
