import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { webhooks } from "@/server/db/schema/webhooks";
import type { WebhookEvent } from "@/server/db/schema/webhooks";
import { videos } from "@/server/db/schema/videos";
import type { Comment } from "@/server/db/schema/social";
import { deliverWebhook } from "./deliver";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/** Finds all enabled webhooks for `channelId` that subscribe to `event`. */
const findWebhooksForEvent = async (channelId: string, event: WebhookEvent): Promise<string[]> => {
    const rows = await db
        .select({ id: webhooks.id })
        .from(webhooks)
        .where(
            and(
                eq(webhooks.channelId, channelId),
                eq(webhooks.enabled, true),
                sql`${event} = ANY(${webhooks.events})`,
            ),
        );
    return rows.map((r) => r.id);
};

/** Fires deliverWebhook in parallel for each id in `webhookIds`. */
const fireAll = (webhookIds: string[], event: WebhookEvent, payload: Record<string, unknown>): void => {
    for (const webhookId of webhookIds) {
        void deliverWebhook({ webhookId, event, payload });
    }
};

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export type FanoutVideoEventOptions = {
    videoId: string;
    event: Extract<WebhookEvent, "transcode.completed" | "transcode.failed">;
};

/**
 * Loads the video's channelId, finds enabled webhooks that subscribe to
 * `event`, and fires them in parallel. Best-effort; errors are logged.
 */
export const fanoutVideoEvent = async (opts: FanoutVideoEventOptions): Promise<void> => {
    try {
        const { videoId, event } = opts;

        const videoRows = await db
            .select({ channelId: videos.channelId })
            .from(videos)
            .where(eq(videos.id, videoId))
            .limit(1);

        const video = videoRows[0];
        if (!video) {
            console.warn(`[webhooks] fanoutVideoEvent: video ${videoId} not found`);
            return;
        }

        const webhookIds = await findWebhooksForEvent(video.channelId, event);
        if (webhookIds.length === 0) return;

        const payload: Record<string, unknown> = {
            event,
            videoId,
            channelId: video.channelId,
            at: new Date().toISOString(),
        };

        fireAll(webhookIds, event, payload);
    } catch (err) {
        console.error("[webhooks] fanoutVideoEvent error:", err);
    }
};

export type FanoutCommentEventOptions = {
    comment: Comment;
};

/**
 * Derives the channelId from the comment's video, finds enabled webhooks
 * subscribed to "comment.created", and fires them in parallel. Best-effort.
 */
export const fanoutCommentEvent = async (opts: FanoutCommentEventOptions): Promise<void> => {
    try {
        const { comment } = opts;
        const event: WebhookEvent = "comment.created";

        const videoRows = await db
            .select({ channelId: videos.channelId })
            .from(videos)
            .where(eq(videos.id, comment.videoId))
            .limit(1);

        const video = videoRows[0];
        if (!video) {
            console.warn(`[webhooks] fanoutCommentEvent: video ${comment.videoId} not found`);
            return;
        }

        const webhookIds = await findWebhooksForEvent(video.channelId, event);
        if (webhookIds.length === 0) return;

        const payload: Record<string, unknown> = {
            event,
            commentId: comment.id,
            videoId: comment.videoId,
            channelId: video.channelId,
            parentId: comment.parentId ?? null,
            at: new Date().toISOString(),
        };

        fireAll(webhookIds, event, payload);
    } catch (err) {
        console.error("[webhooks] fanoutCommentEvent error:", err);
    }
};
