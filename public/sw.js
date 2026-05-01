/* cassette service worker — small, workbox-free.
 *
 * Strategy:
 *  - Precache the bare app shell on install: "/", "/favicon.svg", "/manifest.webmanifest".
 *  - Runtime: cache-first for /_next/static/** + /icon-*.png (immutable, hashed).
 *  - Network-only for everything else. HLS .m3u8/.ts and /api/** MUST never
 *    be cached: they are auth-bound, large, and signed-token-protected.
 *
 * Honours `prefers-reduced-data: reduce` by skipping the precache list.
 */

const VERSION = "v1";
const SHELL_CACHE = `cassette-shell-${VERSION}`;
const STATIC_CACHE = `cassette-static-${VERSION}`;

const SHELL_URLS = ["/", "/favicon.svg", "/manifest.webmanifest"];

const reducedData = () => {
    try {
        return self.matchMedia && self.matchMedia("(prefers-reduced-data: reduce)").matches;
    } catch (_e) {
        return false;
    }
};

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            if (reducedData()) {
                // Skip pre-caching when the user has opted into reduced data.
                self.skipWaiting();
                return;
            }
            const cache = await caches.open(SHELL_CACHE);
            // Best-effort: a 404 on /icon-* shouldn't fail the install.
            await Promise.allSettled(SHELL_URLS.map((u) => cache.add(u)));
            self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter((n) => n !== SHELL_CACHE && n !== STATIC_CACHE)
                    .map((n) => caches.delete(n)),
            );
            await self.clients.claim();
        })(),
    );
});

const isStaticAsset = (url) => {
    return (
        url.pathname.startsWith("/_next/static/") ||
        /^\/icon-\d+\.png$/.test(url.pathname) ||
        url.pathname === "/favicon.svg"
    );
};

const isNetworkOnly = (url) => {
    // Anything API-bound or HLS — never cache.
    if (url.pathname.startsWith("/api/")) return true;
    if (url.pathname.endsWith(".m3u8")) return true;
    if (url.pathname.endsWith(".ts")) return true;
    if (url.pathname.endsWith(".vtt")) return true;
    return false;
};

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (isNetworkOnly(url)) {
        // Explicit pass-through. Do not even consult the cache.
        return;
    }

    if (isStaticAsset(url)) {
        event.respondWith(
            (async () => {
                const cached = await caches.match(request);
                if (cached) return cached;
                try {
                    const response = await fetch(request);
                    if (response.ok) {
                        const cache = await caches.open(STATIC_CACHE);
                        cache.put(request, response.clone());
                    }
                    return response;
                } catch (err) {
                    // Offline: return whatever we have, even if stale.
                    if (cached) return cached;
                    throw err;
                }
            })(),
        );
        return;
    }

    // Default: network-first for navigations so HTML reflects fresh data,
    // falling back to the cached app shell when offline.
    if (request.mode === "navigate") {
        event.respondWith(
            (async () => {
                try {
                    return await fetch(request);
                } catch (_err) {
                    const cached = await caches.match("/");
                    if (cached) return cached;
                    return new Response("offline", { status: 503, statusText: "offline" });
                }
            })(),
        );
    }
});
