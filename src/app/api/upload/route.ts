import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { type IncomingMessage } from "node:http";
import { join, relative } from "node:path";
import { Readable } from "node:stream";

import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { env } from "@/env";
import { auth, verifyApiKey } from "@/lib/auth";
import { ensureDir, paths, sourcePathForChannel, sourcePathForVideo } from "@/lib/paths";
import { limit } from "@/lib/ratelimit";
import { checkQuota } from "@/lib/quota";
import { unlistedSlug } from "@/lib/slug";
import { parseMultipart } from "@/lib/upload/multipart";
import { parseYtDlpSidecar, type ParsedSidecar } from "@/lib/yt-dlp/sidecar";
import { db } from "@/server/db/client";
import { channelMembers, channels } from "@/server/db/schema/channels";
import { transcodeJobs, type TranscodeJobState } from "@/server/db/schema/jobs";
import { videoChapters, videos } from "@/server/db/schema/videos";
import { ensureBoss } from "@/worker/boot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ------------------------------------------------------------------
// Validation helpers
// ------------------------------------------------------------------

const PRIVACY_VALUES = ["public", "unlisted", "private"] as const;
type Privacy = (typeof PRIVACY_VALUES)[number];

const isPrivacy = (v: string): v is Privacy => PRIVACY_VALUES.includes(v as Privacy);

const clamp = (s: string, max: number): string => s.slice(0, max);

const TAG_RE = /^[a-z0-9-]+$/;
const MAX_TAGS = 12;
const MAX_TAG_LEN = 30;

/**
 * Parse, normalise, deduplicate and validate a comma-separated tags string.
 * Returns an empty array when the input is absent or empty.
 */
const parseTags = (raw: string | undefined): string[] => {
    if (!raw) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const part of raw.split(",")) {
        const tag = part.trim().toLowerCase().slice(0, MAX_TAG_LEN);
        if (!tag || !TAG_RE.test(tag) || seen.has(tag)) continue;
        seen.add(tag);
        result.push(tag);
        if (result.length >= MAX_TAGS) break;
    }
    return result;
};

// ------------------------------------------------------------------
// Route handler
// ------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
    // ---- 1. Authentication ----

    const authHeader = req.headers.get("authorization") ?? "";
    let channelId: string | null = null;
    let uploaderId: string | null = null;

    if (authHeader.startsWith("Bearer vid_")) {
        // Auth path A: API key
        const plaintext = authHeader.slice("Bearer ".length);
        const verified = await verifyApiKey(plaintext);
        if (!verified) {
            return json401("invalid or revoked API key");
        }
        channelId = verified.channel.id;
        // API keys are channel-scoped; no user id available for the uploader field.
        uploaderId = null;

        // Rate limit: 60 uploads/hour per API key (key id as identifier).
        const rl = limit({ key: "upload", identifier: verified.apiKeyId, windowMs: 3_600_000, max: 60 });
        if (!rl.allowed) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) },
            });
        }
    } else {
        // Auth path B: Better-Auth session
        const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
        if (!session?.user) {
            return json401("not authenticated");
        }
        uploaderId = session.user.id;

        // Rate limit: 12 uploads/hour per session user.
        const rl = limit({ key: "upload", identifier: uploaderId, windowMs: 3_600_000, max: 12 });
        if (!rl.allowed) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)) },
            });
        }

        // channelId must come from the form (parsed later) OR from a query param.
        // We peek at the query string to allow pre-auth channel resolution.
        channelId = req.nextUrl.searchParams.get("channelId");
        // If not in query, we parse it from the form body below.
    }

    // ---- 2. Parse multipart ----

    // We need to know channelId before we can build the file path, but channelId
    // may be inside the form body (session auth). The approach: parse multipart first,
    // then validate channel membership.

    // Build a temporary writable that we swap out once we know the final path.
    // For simplicity we use a two-pass approach: collect fields first via a null
    // writable, then stream the real file. This adds latency proportional to
    // upload size and is only acceptable for v1 (see PLAN §5 note on TUS).
    //
    // Better approach: use a temp file, then rename. That is what we do.
    const tmpName = randomBytes(8).toString("hex");
    const tmpDir = join(paths.sourceRoot, ".tmp");
    await ensureDir(tmpDir);
    const tmpPath = join(tmpDir, tmpName);

    const incomingHeaders = Object.fromEntries(req.headers.entries());
    const tmpWritable = createWriteStream(tmpPath);

    const rawBody = req.body;
    if (!rawBody) {
        return new Response(JSON.stringify({ error: "empty body" }), { status: 400 });
    }

    // Convert the Web ReadableStream to a Node stream so busboy can pipe it.
    // Node:stream is imported statically at the top of the file because the
    // production Webpack bundle was tree-shaking Readable.fromWeb out of a
    // dynamic import expression and crashing at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(rawBody as any);

    let parsed: Awaited<ReturnType<typeof parseMultipart>>;

    try {
        parsed = await parseMultipart(nodeStream as unknown as IncomingMessage, {
            maxFileBytes: env.MAX_UPLOAD_BYTES,
            fileTarget: tmpWritable,
            headers: incomingHeaders,
        });
    } catch (err) {
        // Cleanup temp file on parse failure.
        await import("node:fs/promises").then((fs) => fs.unlink(tmpPath).catch(() => undefined));

        if (err instanceof Error && err.message.includes("exceeds maximum size")) {
            return new Response(JSON.stringify({ error: "upload exceeds maximum size" }), { status: 413 });
        }
        void import("@/lib/error-monitoring").then(({ captureException }) => captureException(err));
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
    }

    // ---- 3. Parse yt-dlp sidecar (if any) ----

    // The first `info[]` file we accept is treated as authoritative; any
    // others (theoretically possible if the operator passes multiple) are
    // ignored. Sidecar values are only used to backfill — explicit form
    // fields always win.
    let sidecar: ParsedSidecar = {};
    if (parsed.info.length > 0) {
        sidecar = parseYtDlpSidecar(parsed.info[0]!.data);
    }

    // ---- 4. Extract and validate fields ----

    const formTitle = parsed.fields["title"]?.trim();
    const title = formTitle && formTitle.length > 0 ? formTitle : sidecar.title;
    if (!title) {
        await cleanupTmp(tmpPath);
        return new Response(JSON.stringify({ error: "title is required" }), { status: 400 });
    }

    const formDescription = parsed.fields["description"]?.trim();
    const description = clamp(
        formDescription && formDescription.length > 0 ? formDescription : (sidecar.description ?? ""),
        10_000,
    );
    const privacyRaw = parsed.fields["privacy"]?.trim() ?? "public";
    const privacy: Privacy = isPrivacy(privacyRaw) ? privacyRaw : "public";
    const formTags = parseTags(parsed.fields["tags"]);
    const tags = formTags.length > 0 ? formTags : (sidecar.tags ?? []);

    // Drafts: client may set draft=true (or 1/yes) to upload the source file
    // without enqueuing a transcode job. Drafts can be flipped to live later
    // via video.publish, or scheduled by setting publishAt to a future time.
    const draftRaw = parsed.fields["draft"]?.trim().toLowerCase() ?? "";
    const draftFlag = draftRaw === "true" || draftRaw === "1" || draftRaw === "yes";

    // publishAt: ISO-8601 timestamp. A future timestamp combined with the
    // draft flag schedules a publish-video pg-boss job; past timestamps are
    // ignored and the upload follows the normal transcode flow.
    const publishAtRaw = parsed.fields["publishAt"]?.trim() ?? "";
    let publishAt: Date | null = null;
    if (publishAtRaw) {
        const parsedDate = new Date(publishAtRaw);
        if (!isNaN(parsedDate.getTime())) publishAt = parsedDate;
    }
    const isFuturePublish = publishAt !== null && publishAt.getTime() > Date.now();
    const isDraft = draftFlag || isFuturePublish;

    // If session auth and channelId not in query, read from form.
    if (!channelId) {
        channelId = parsed.fields["channelId"]?.trim() ?? null;
    }

    if (!channelId) {
        await cleanupTmp(tmpPath);
        return new Response(JSON.stringify({ error: "channelId is required for session auth" }), { status: 400 });
    }

    // ---- 4. Validate channel membership (session auth) ----

    const channelRows = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);

    const channel = channelRows[0];
    if (!channel) {
        await cleanupTmp(tmpPath);
        return new Response(JSON.stringify({ error: "channel not found" }), { status: 404 });
    }

    // For session auth, verify the user is a member of the channel.
    if (uploaderId) {
        const memberRows = await db
            .select()
            .from(channelMembers)
            .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, uploaderId)))
            .limit(1);

        if (!memberRows[0]) {
            await cleanupTmp(tmpPath);
            return new Response(JSON.stringify({ error: "you are not a member of this channel" }), { status: 403 });
        }
    }

    // ---- 4b. Quota pre-check (Content-Length fast path) ----

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > 0) {
            const quotaResult = await checkQuota({ channelId, addingBytes: contentLength });
            if (!quotaResult.ok && quotaResult.quota !== null) {
                await cleanupTmp(tmpPath);
                const usedMb = (quotaResult.used / 1_048_576).toFixed(1);
                const quotaMb = (quotaResult.quota / 1_048_576).toFixed(1);
                return new Response(
                    JSON.stringify({ error: `Channel quota exceeded — ${usedMb} MB of ${quotaMb} MB used.` }),
                    { status: 413 },
                );
            }
        }
    }

    // ---- 4c. Quota mid-stream check (no Content-Length / file now on disk) ----

    if (!contentLengthHeader) {
        const actualBytes = parsed.file.bytesWritten;
        const quotaResult = await checkQuota({ channelId, addingBytes: actualBytes });
        if (!quotaResult.ok && quotaResult.quota !== null) {
            await cleanupTmp(tmpPath);
            const usedMb = (quotaResult.used / 1_048_576).toFixed(1);
            const quotaMb = (quotaResult.quota / 1_048_576).toFixed(1);
            return new Response(
                JSON.stringify({ error: `Channel quota exceeded — ${usedMb} MB of ${quotaMb} MB used.` }),
                { status: 413 },
            );
        }
    }

    // ---- 5. Determine file extension and target path ----

    const rawFilename = parsed.file.filename || "upload.bin";
    const extMatch = /(\.[^.]+)$/.exec(rawFilename);
    const ext = extMatch?.[1] ?? ".bin";

    // ---- 6. Insert video row ----

    const slugValue = privacy === "unlisted" ? unlistedSlug() : null;
    const { videoPublicId } = await import("@/lib/slug");
    const publicId = videoPublicId();

    const [videoRow] = await db
        .insert(videos)
        .values({
            channelId,
            publicId,
            uploaderId: uploaderId ?? undefined,
            title: clamp(title, 200),
            description,
            privacy,
            unlistedSlug: slugValue,
            // Drafts and scheduled-publish: we still persist the row but
            // leave it queued/un-transcoded. The publish-video job (or a
            // manual video.publish call) is what actually enqueues the
            // transcode pipeline later.
            status: "queued",
            isDraft,
            publishAt: publishAt ?? undefined,
            tags,
            // Temporary placeholder; updated to final path below.
            sourcePath: `.tmp/${tmpName}`,
            // Backfill publishedAt from the sidecar when present. The
            // transcode worker only sets publishedAt at finalise-time when
            // the column is null, so this preserves the original publish
            // date without introducing a special-case.
            publishedAt: sidecar.publishedAt ?? undefined,
        })
        .returning();

    if (!videoRow) {
        await cleanupTmp(tmpPath);
        return new Response(JSON.stringify({ error: "failed to create video record" }), { status: 500 });
    }

    const videoId = videoRow.id;

    // ---- 7. Move temp file to final path ----

    const channelDir = sourcePathForChannel(channel.handle);
    await ensureDir(channelDir);
    const finalPath = sourcePathForVideo(channel.handle, videoId, ext);

    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, finalPath);

    const sourcePath = relative(paths.sourceRoot, finalPath);

    // Compute sha256 from the file we just wrote (streaming re-read for correctness).
    // For large files this adds a second pass; acceptable for v1.
    const sha256 = await computeFileSha256(finalPath);

    // Update video row with final source path and hash.
    await db.update(videos).set({ sourcePath, sourceSha256: sha256 }).where(eq(videos.id, videoId));

    // ---- 8. Handle sidecar captions ----

    if (parsed.captions.length > 0) {
        const { mkdir, writeFile } = await import("node:fs/promises");
        const captionsDir = join(channelDir, `${videoId}.captions`);
        await mkdir(captionsDir, { recursive: true });

        for (const cap of parsed.captions) {
            // Expect filename pattern: "<lang>-<Label>.vtt", e.g. "en-English.vtt"
            const capFilename = cap.filename;
            const langMatch = /^([a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{2,8})?)-(.+?)\.vtt$/i.exec(capFilename);
            const lang = langMatch?.[1]?.toLowerCase() ?? "und";
            const label = langMatch?.[2] ?? lang;

            const capPath = join(captionsDir, `${lang}.vtt`);
            await writeFile(capPath, cap.data);

            // Seed video_captions row; ignore conflicts (unique on videoId+lang).
            const { videoCaptions } = await import("@/server/db/schema/videos");
            await db
                .insert(videoCaptions)
                .values({
                    videoId,
                    lang,
                    label,
                    source: "sidecar",
                    vttPath: relative(paths.sourceRoot, capPath),
                    isDefault: false,
                })
                .onConflictDoNothing();
        }
    }

    // ---- 8b. Seed sidecar chapters (yt-dlp .info.json) ----
    //
    // The transcode worker's chapters step skips the description/container
    // parse when chapters already exist for the video (onConflictDoNothing
    // on the same composite). Pre-seeding here means the sidecar wins over
    // both, which matches operator intent: if you went to the trouble of
    // capturing the original chapter list, that is what should ship.

    if (sidecar.chapters && sidecar.chapters.length > 0) {
        await db
            .insert(videoChapters)
            .values(
                sidecar.chapters.map((c) => ({
                    videoId,
                    startSec: c.startSec,
                    endSec: c.endSec ?? undefined,
                    title: c.title,
                    source: "container" as const,
                })),
            )
            .onConflictDoNothing();
    }

    // ---- 9. Insert transcode_jobs mirror row + enqueue ----
    //
    // Drafts skip the transcode mirror row and the transcode-video pg-boss
    // job; the user explicitly asked us to hold the upload. If publishAt is
    // set, we also schedule a publish-video job that will flip the draft
    // and enqueue the transcode at the appointed time.

    const boss = await ensureBoss();
    let respondStatus: "queued" | "draft" | "scheduled" = "queued";

    if (isDraft) {
        if (isFuturePublish && publishAt) {
            await boss
                .send(
                    "publish-video",
                    { videoId },
                    {
                        retryLimit: 2,
                        retryBackoff: true,
                        expireInHours: 24 * 30,
                        startAfter: publishAt,
                        singletonKey: videoId,
                    },
                )
                .catch((err) => {
                    // The video row remains a draft; the operator can
                    // re-schedule from the studio. We log but don't fail
                    // the upload so the source file is preserved.
                    console.warn("[upload] failed to schedule publish-video job:", err);
                });
            respondStatus = "scheduled";
        } else {
            respondStatus = "draft";
        }
    } else {
        const [jobRow] = await db
            .insert(transcodeJobs)
            .values({
                videoId,
                state: "queued" as TranscodeJobState,
                progress: 0,
            })
            .returning();

        // ensureBoss boots the worker on demand if instrumentation has not yet
        // landed it (this can happen on cold-start race in dev mode where the
        // request lands before instrumentation.ts has fully run).
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

        if (pgbossJobId && jobRow) {
            await db.update(transcodeJobs).set({ pgbossJobId }).where(eq(transcodeJobs.id, jobRow.id));
        }
    }

    // ---- 10. Respond 201 ----

    return new Response(
        JSON.stringify({
            videoId,
            status: respondStatus,
            statusUrl: `/api/trpc/video.uploadStatus?input=${encodeURIComponent(JSON.stringify({ videoId }))}`,
            watchUrl: privacy === "unlisted" && slugValue ? `/watch/${videoId}?slug=${slugValue}` : `/watch/${videoId}`,
        }),
        {
            status: 201,
            headers: { "Content-Type": "application/json" },
        },
    );
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const json401 = (message: string): Response =>
    new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer", "Content-Type": "application/json" },
    });

const cleanupTmp = async (tmpPath: string): Promise<void> => {
    const { unlink } = await import("node:fs/promises");
    await unlink(tmpPath).catch(() => undefined);
};

const computeFileSha256 = async (filePath: string): Promise<string> => {
    const { createReadStream } = await import("node:fs");
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = createReadStream(filePath);
        stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
    });
};
