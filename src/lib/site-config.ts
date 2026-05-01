import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { siteConfig, type PrivacyMode } from "@/server/db/schema/site";

// ---------------------------------------------------------------------------
// In-process cache (30 s TTL)
// ---------------------------------------------------------------------------

let cachedMode: PrivacyMode | null = null;
let cacheExpiresAt = 0;

const CACHE_TTL_MS = 30_000;

/**
 * Returns the current site-wide privacy mode, caching it in-process for 30 s.
 * Defaults to "public" if the DB row is missing for any reason.
 */
export const getPrivacyMode = async (): Promise<PrivacyMode> => {
    const now = Date.now();
    if (cachedMode !== null && now < cacheExpiresAt) {
        return cachedMode;
    }

    try {
        const rows = await db.select({ privacyMode: siteConfig.privacyMode }).from(siteConfig).where(eq(siteConfig.id, 1)).limit(1);
        const mode = rows[0]?.privacyMode ?? "public";
        cachedMode = mode;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return mode;
    } catch {
        // Fail open: if DB is unreachable, do not lock everyone out.
        return "public";
    }
};

/** Force-invalidates the in-process cache. Call after an admin update. */
export const invalidateSiteConfigCache = (): void => {
    cachedMode = null;
    cacheExpiresAt = 0;
};
