import { and, eq, ne, sum } from "drizzle-orm";

import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { videos } from "@/server/db/schema/videos";

// ---------------------------------------------------------------------------
// Per-channel disk quota helpers
// ---------------------------------------------------------------------------

/**
 * Returns the sum of sourceBytes for all non-failed videos in the channel.
 * Includes queued and transcoding videos so in-flight uploads are counted.
 */
export const getChannelUsage = async (channelId: string): Promise<number> => {
    const rows = await db
        .select({ total: sum(videos.sourceBytes) })
        .from(videos)
        .where(and(eq(videos.channelId, channelId), ne(videos.status, "failed")));

    return Number(rows[0]?.total ?? 0);
};

export interface QuotaCheckResult {
    ok: boolean;
    used: number;
    quota: number | null;
    remaining: number | null;
}

/**
 * Checks whether adding `addingBytes` would exceed the channel's disk quota.
 * Returns `ok: true` when quota is null (no limit) or when used + addingBytes
 * is within the quota.
 */
export const checkQuota = async ({
    channelId,
    addingBytes,
}: {
    channelId: string;
    addingBytes: number;
}): Promise<QuotaCheckResult> => {
    const [channelRow, used] = await Promise.all([
        db
            .select({ diskQuotaBytes: channels.diskQuotaBytes })
            .from(channels)
            .where(eq(channels.id, channelId))
            .limit(1),
        getChannelUsage(channelId),
    ]);

    const quota = channelRow[0]?.diskQuotaBytes ?? null;

    if (quota === null) {
        return { ok: true, used, quota: null, remaining: null };
    }

    const remaining = Math.max(0, quota - used);
    const ok = used + addingBytes <= quota;

    return { ok, used, quota, remaining };
};
