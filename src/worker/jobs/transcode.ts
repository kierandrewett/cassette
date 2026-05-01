import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { eq } from "drizzle-orm";

import { env } from "@/env";
import { extractEmbeddedCaptions } from "@/lib/transcode/captions";
import { containerChapters, mergeChapters, parseDescriptionChapters, withEndSec } from "@/lib/transcode/chapters";
import { FfmpegError, type H264Encoder, resolveH264Encoder, runFfmpeg, spawnFfmpeg } from "@/lib/transcode/ffmpeg";
import { buildLadder, type Rung } from "@/lib/transcode/ladder";
import { probe } from "@/lib/transcode/probe";
import { generateSprite } from "@/lib/transcode/sprite";
import { ensureDir, hlsDir as makeHlsDir, hlsSpriteJpgPath, hlsSpriteVttPath, hlsThumbnailPath, paths } from "@/lib/paths";
import { db } from "@/server/db/client";
import { transcodeJobs } from "@/server/db/schema/jobs";
import { videoCaptions, videoChapters, videos, videoVariants } from "@/server/db/schema/videos";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type TranscodePayload = {
    videoId: string;
};

type StepProgress = {
    progress: number;
    step: string;
};

const STEPS: Record<string, StepProgress> = {
    probe:      { progress: 5,  step: "probe" },
    ladder:     { progress: 10, step: "ladder" },
    transcode:  { progress: 70, step: "transcode" },
    thumbnail:  { progress: 75, step: "thumbnail" },
    sprite:     { progress: 85, step: "sprite" },
    captions:   { progress: 90, step: "captions" },
    chapters:   { progress: 92, step: "chapters" },
    finalise:   { progress: 100, step: "finalise" },
};

// ------------------------------------------------------------------
// Progress helpers
// ------------------------------------------------------------------

const updateProgress = async (videoId: string, stepKey: keyof typeof STEPS): Promise<void> => {
    const s = STEPS[stepKey];
    if (!s) return;
    await db
        .update(transcodeJobs)
        .set({ progress: s.progress, step: s.step })
        .where(eq(transcodeJobs.videoId, videoId));
};

const markRunning = async (videoId: string): Promise<void> => {
    await db
        .update(transcodeJobs)
        .set({ state: "running", startedAt: new Date() })
        .where(eq(transcodeJobs.videoId, videoId));
    await db
        .update(videos)
        .set({ status: "transcoding" })
        .where(eq(videos.id, videoId));
};

const markCompleted = async (videoId: string): Promise<void> => {
    await db
        .update(transcodeJobs)
        .set({ state: "completed", finishedAt: new Date() })
        .where(eq(transcodeJobs.videoId, videoId));
};

const markFailed = async (videoId: string, message: string): Promise<void> => {
    await db
        .update(transcodeJobs)
        .set({ state: "failed", finishedAt: new Date(), message: message.slice(-4096) })
        .where(eq(transcodeJobs.videoId, videoId));
    await db
        .update(videos)
        .set({ status: "failed" })
        .where(eq(videos.id, videoId));

    // Fire webhook fanout for transcode.failed. Best-effort.
    const { fanoutVideoEvent } = await import("@/lib/webhooks/fanout");
    void fanoutVideoEvent({ videoId, event: "transcode.failed" });
};

// ------------------------------------------------------------------
// Main handler
// ------------------------------------------------------------------

// pg-boss v10 delivers a batch of jobs to the handler. We process each serially
// to avoid overloading the machine; batchSize in boot.ts controls parallelism.
export const transcodeHandler = async (jobs: Array<{ data: TranscodePayload }>): Promise<void> => {
    for (const job of jobs) {
        const { videoId } = job.data;

        await markRunning(videoId);

        try {
            await runPipeline(videoId);
            await markCompleted(videoId);
        } catch (err) {
            const message =
                err instanceof FfmpegError
                    ? `${err.message}\n${err.stderr}`
                    : err instanceof Error
                      ? err.message
                      : String(err);
            await markFailed(videoId, message);
            // Do not re-throw: failing one job should not prevent others in the
            // batch from running. pg-boss marks the job failed via our DB update.
        }
    }
};

// ------------------------------------------------------------------
// Pipeline
// ------------------------------------------------------------------

const runPipeline = async (videoId: string): Promise<void> => {
    // ---- load video row ----
    const videoRows = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    const video = videoRows[0];
    if (!video) throw new Error(`video ${videoId} not found`);

    // Load channel handle for path resolution.
    const { channels } = await import("@/server/db/schema/channels");
    const channelRows = await db.select().from(channels).where(eq(channels.id, video.channelId)).limit(1);
    const channel = channelRows[0];
    if (!channel) throw new Error(`channel ${video.channelId} not found`);

    // Source path is stored relative to MEDIA_SOURCE_PATH.
    const sourcePath = join(paths.sourceRoot, video.sourcePath);

    // ---- 1. probe (5%) ----
    await updateProgress(videoId, "probe");
    const meta = await probe(sourcePath);

    // Persist probe metadata to the videos row immediately.
    await db
        .update(videos)
        .set({
            durationSec: Math.round(meta.durationSec),
            width: meta.width,
            height: meta.height,
            fps: String(meta.fps.toFixed(3)),
            videoCodec: meta.videoCodec,
            audioCodec: meta.audioCodec ?? undefined,
        })
        .where(eq(videos.id, videoId));

    // ---- 2. ladder (10%) ----
    await updateProgress(videoId, "ladder");
    const ladder = buildLadder(meta.height);

    // ---- 3. transcode (10 → 70%) ----
    await updateProgress(videoId, "transcode");

    const hlsRoot = makeHlsDir(videoId);
    await ensureDir(hlsRoot);

    // Choose encoder. Order: NVENC (if requested by env) > libx264 > libopenh264.
    // libopenh264 fallback exists so the worker still runs against Fedora's
    // ffmpeg-free build (no GPL libx264) — useful for local dev and CI on
    // distributions that ship the trimmed ffmpeg.
    const encoder = await resolveH264Encoder(env.ENABLE_NVENC);
    if (env.ENABLE_NVENC && encoder !== "h264_nvenc") {
        console.warn(`[transcode] ENABLE_NVENC=1 but h264_nvenc not available; falling back to ${encoder}`);
    }

    await runTranscode({
        sourcePath,
        hlsRoot,
        ladder,
        durationSec: meta.durationSec,
        hasAudio: !!meta.audioStream,
        encoder,
        onProgress: async (fraction) => {
            // Map transcode progress (0–1) to 10–70% overall.
            const overall = Math.round(10 + fraction * 60);
            await db
                .update(transcodeJobs)
                .set({ progress: overall })
                .where(eq(transcodeJobs.videoId, videoId));
        },
    });

    // ---- 4. thumbnail (75%) ----
    await updateProgress(videoId, "thumbnail");
    const thumbPath = hlsThumbnailPath(videoId);
    await ensureDir(join(hlsRoot)); // already exists
    const thumbOffset = Math.max(1, Math.round(meta.durationSec * 0.1));
    await runFfmpeg([
        "-ss", String(thumbOffset),
        "-i", sourcePath,
        "-frames:v", "1",
        "-q:v", "3",
        thumbPath,
    ]);

    // ---- 5. sprite (85%) ----
    await updateProgress(videoId, "sprite");
    const spriteJpg = hlsSpriteJpgPath(videoId);
    const spriteVtt = hlsSpriteVttPath(videoId);
    await generateSprite({
        sourcePath,
        durationSec: meta.durationSec,
        jpgPath: spriteJpg,
        vttPath: spriteVtt,
        spriteUrl: "sprite.jpg",
    });

    // ---- 6. captions (90%) ----
    await updateProgress(videoId, "captions");
    const captionsDir = join(hlsRoot, "captions");
    const extractedCaptions = await extractEmbeddedCaptions({
        sourcePath,
        subtitleStreams: meta.subtitleStreams,
        captionsDir,
    });

    if (extractedCaptions.length > 0) {
        await db.insert(videoCaptions).values(
            extractedCaptions.map((c) => ({
                videoId,
                lang: c.lang,
                label: c.label,
                source: "embedded" as const,
                vttPath: relative(paths.hlsRoot, c.vttPath),
                isDefault: c.isDefault,
            })),
        ).onConflictDoNothing();
    }

    // ---- 7. chapters (92%) ----
    await updateProgress(videoId, "chapters");

    const descChapters = parseDescriptionChapters(video.description);
    const contChapters = containerChapters(meta.chapters);
    const merged = mergeChapters(contChapters, descChapters);
    const finalChapters = withEndSec(merged, meta.durationSec);

    if (finalChapters.length > 0) {
        await db.insert(videoChapters).values(
            finalChapters.map((c) => ({
                videoId,
                startSec: c.startSec,
                endSec: c.endSec,
                title: c.title,
                source: c.source,
            })),
        ).onConflictDoNothing();
    }

    // ---- 8. finalise (100%) ----
    await updateProgress(videoId, "finalise");

    // Insert variant rows.
    await db.insert(videoVariants).values(
        ladder.map((rung) => ({
            videoId,
            rung: rung.name,
            width: rung.width,
            height: rung.height,
            bandwidth: rung.bandwidth,
            codecs: rung.codecs,
            playlistPath: join(rung.name, "playlist.m3u8"),
        })),
    ).onConflictDoNothing();

    // Mark video ready.
    await db
        .update(videos)
        .set({
            status: "ready",
            hlsDir: videoId, // relative to MEDIA_HLS_PATH
            thumbnailPath: relative(paths.hlsRoot, thumbPath),
            spriteJpgPath: relative(paths.hlsRoot, spriteJpg),
            spriteVttPath: relative(paths.hlsRoot, spriteVtt),
            publishedAt: video.publishedAt ?? new Date(),
            updatedAt: new Date(),
        })
        .where(eq(videos.id, videoId));

    // Fan out new-upload notifications to subscribers. Best-effort: any
    // failure inside notifyNewUpload is logged but does not propagate, so a
    // notifications outage cannot fail the transcode itself.
    const { notifyNewUpload } = await import("@/lib/notifications/fanout");
    await notifyNewUpload(videoId);

    // Fire webhook fanout for transcode.completed. Best-effort; void so a
    // webhooks failure can never propagate into the pipeline.
    const { fanoutVideoEvent } = await import("@/lib/webhooks/fanout");
    void fanoutVideoEvent({ videoId, event: "transcode.completed" });
};

// ------------------------------------------------------------------
// ffmpeg transcode invocation
// ------------------------------------------------------------------

type RunTranscodeOptions = {
    sourcePath: string;
    hlsRoot: string;
    ladder: Rung[];
    durationSec: number;
    hasAudio: boolean;
    encoder: H264Encoder;
    onProgress: (fraction: number) => Promise<void>;
};

const runTranscode = async (opts: RunTranscodeOptions): Promise<void> => {
    const { sourcePath, hlsRoot, ladder, durationSec, hasAudio, encoder, onProgress } = opts;
    const n = ladder.length;

    // Build filter_complex: split the video stream N ways, scale each output.
    // [0:v]split=N[v0][v1]...; [v0]scale=w:h:force_original_aspect_ratio=decrease[v0o]; ...
    const splitOutputs = ladder.map((_, i) => `[v${i}]`).join("");
    const splitFilter = `[0:v]split=${n}${splitOutputs}`;
    const scaleFilters = ladder.map(
        (rung, i) =>
            `[v${i}]scale=w=${rung.width}:h=${rung.height}:force_original_aspect_ratio=decrease[v${i}o]`,
    );
    const filterComplex = [splitFilter, ...scaleFilters].join("; ");

    const args: string[] = ["-y", "-i", sourcePath, "-filter_complex", filterComplex];

    // Per-variant output map and codec args.
    for (let i = 0; i < n; i++) {
        const rung = ladder[i]!;

        args.push("-map", `[v${i}o]`);
        if (hasAudio) {
            args.push("-map", "0:a:0?");
        }

        if (encoder === "h264_nvenc") {
            args.push(
                `-c:v:${i}`, "h264_nvenc",
                `-preset:v:${i}`, "p4",
                `-tune:v:${i}`, "hq",
                `-rc:v:${i}`, "vbr",
                `-cq:v:${i}`, "21",
            );
        } else if (encoder === "libx264") {
            args.push(
                `-c:v:${i}`, "libx264",
                `-preset:v:${i}`, "veryfast",
                `-profile:v:${i}`, "high",
                `-level:v:${i}`, "4.1",
            );
        } else {
            // libopenh264 supports a much smaller knob surface than libx264.
            args.push(
                `-c:v:${i}`, "libopenh264",
            );
        }

        args.push(
            `-b:v:${i}`, rung.videoBitrate,
            `-maxrate:v:${i}`, rung.maxBitrate,
            `-bufsize:v:${i}`, rung.bufSize,
            `-g:v:${i}`, "60",
            `-keyint_min:v:${i}`, "60",
            `-sc_threshold:v:${i}`, "0",
        );

        if (hasAudio) {
            args.push(
                `-c:a:${i}`, "aac",
                `-b:a:${i}`, rung.audioBitrate,
                `-ac:a:${i}`, "2",
            );
        }
    }

    // HLS muxer options.
    const varStreamMap = ladder
        .map((rung, i) => (hasAudio ? `v:${i},a:${i},name:${rung.name}` : `v:${i},name:${rung.name}`))
        .join(" ");

    // Ensure per-variant subdirectories exist.
    for (const rung of ladder) {
        await mkdir(join(hlsRoot, rung.name), { recursive: true });
    }

    args.push(
        "-f", "hls",
        "-hls_time", "6",
        "-hls_segment_type", "mpegts",
        "-hls_playlist_type", "vod",
        "-hls_flags", "independent_segments+program_date_time",
        "-master_pl_name", "master.m3u8",
        "-hls_segment_filename", join(hlsRoot, "%v/seg-%05d.ts"),
        "-var_stream_map", varStreamMap,
        join(hlsRoot, "%v/playlist.m3u8"),
    );

    let lastReported = 0;
    await spawnFfmpeg({
        args,
        durationSec,
        onProgress: async (fraction) => {
            // Throttle DB writes: only update when fraction changes by > 2%.
            if (fraction - lastReported > 0.02) {
                lastReported = fraction;
                await onProgress(fraction);
            }
        },
    });
};
