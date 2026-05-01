import { and, eq } from "drizzle-orm";

import { logger } from "@/lib/log";
import { captureException } from "@/lib/error-monitoring";
import { db } from "@/server/db/client";
import { transcodeJobs, type TranscodeJobState } from "@/server/db/schema/jobs";
import { videos } from "@/server/db/schema/videos";

const log = logger("publish");

// ---------------------------------------------------------------------------
// Scheduled publish job — pg-boss handler
// ---------------------------------------------------------------------------

export type PublishPayload = {
    videoId: string;
};

/**
 * publishHandler — flips a draft video to live and enqueues the transcode
 * pipeline. Triggered by `boss.send('publish-video', { videoId }, { startAfter })`
 * with publishAt as the start time.
 *
 * Idempotency: if the video is already published (isDraft=false) we skip the
 * re-enqueue. The handler uses singleton-ish behaviour by guarding on the
 * isDraft flag, so accidentally double-firing the schedule never produces
 * two transcode jobs for the same video.
 */
export const publishHandler = async (jobs: Array<{ data: PublishPayload }>): Promise<void> => {
    for (const job of jobs) {
        const { videoId } = job.data;
        try {
            await runPublish(videoId);
        } catch (err) {
            log.error("publish job failed", {
                videoId,
                err: err instanceof Error ? err.message : String(err),
            });
            captureException(err);
            // Do not re-throw — let other batched jobs run.
        }
    }
};

const runPublish = async (videoId: string): Promise<void> => {
    const rows = await db
        .select({ id: videos.id, isDraft: videos.isDraft, status: videos.status })
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);

    const video = rows[0];
    if (!video) {
        log.warn("publish target missing", { videoId });
        return;
    }

    if (!video.isDraft) {
        log.info("publish target already live, skipping", { videoId });
        return;
    }

    // Flip the draft flag and clear publishAt so subsequent runs are no-ops.
    await db
        .update(videos)
        .set({ isDraft: false, publishAt: null, updatedAt: new Date() })
        .where(and(eq(videos.id, videoId), eq(videos.isDraft, true)));

    // Insert a transcode_jobs mirror row if one does not already exist for
    // this video (drafts skip the row at upload time).
    const existingJob = await db
        .select({ id: transcodeJobs.id })
        .from(transcodeJobs)
        .where(eq(transcodeJobs.videoId, videoId))
        .limit(1);

    let mirrorJobId: string | null = existingJob[0]?.id ?? null;
    if (!mirrorJobId) {
        const [jobRow] = await db
            .insert(transcodeJobs)
            .values({
                videoId,
                state: "queued" as TranscodeJobState,
                progress: 0,
            })
            .returning({ id: transcodeJobs.id });
        mirrorJobId = jobRow?.id ?? null;
    }

    // Enqueue the transcode-video pg-boss job.
    const { ensureBoss } = await import("@/worker/boot");
    const boss = await ensureBoss();
    const pgbossJobId = await boss.send(
        "transcode-video",
        { videoId },
        {
            retryLimit: 2,
            retryBackoff: true,
            expireInHours: 6,
            singletonKey: videoId,
        },
    );

    if (pgbossJobId && mirrorJobId) {
        await db.update(transcodeJobs).set({ pgbossJobId }).where(eq(transcodeJobs.id, mirrorJobId));
    }

    log.info("scheduled draft published", { videoId, pgbossJobId });
};
