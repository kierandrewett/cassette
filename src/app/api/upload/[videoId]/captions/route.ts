import { Readable, Writable } from "node:stream";
import { type IncomingMessage } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";

import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { auth, verifyApiKey } from "@/lib/auth";
import { hlsCaptionsPath, paths } from "@/lib/paths";
import { parseMultipart } from "@/lib/upload/multipart";
import { db } from "@/server/db/client";
import { channelMembers } from "@/server/db/schema/channels";
import { videoCaptions, videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/upload/[videoId]/captions
//
// Adds a caption track to an already-uploaded video. Useful when the
// embedded subtitle extraction missed a track or when the operator wants
// to add a translation later.
//
// Authentication mirrors /api/upload:
//   - Bearer vid_<key> in Authorization (channel-scoped API key)
//   - Better-Auth session (caller must be a member of the video's channel)
//
// Body: multipart/form-data with fields:
//   - file (the .vtt content; required)
//   - lang (BCP-47 tag, e.g. "en" or "en-GB"; required)
//   - label (display label, e.g. "English"; defaults to lang)
//   - isDefault (optional "true"/"false")

export async function POST(req: NextRequest, { params }: { params: Promise<{ videoId: string }> }): Promise<Response> {
    const { videoId } = await params;

    // ---- 1. load video + authenticate ----

    const videoRows = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    const video = videoRows[0];
    if (!video) {
        return new Response(JSON.stringify({ error: "video not found" }), { status: 404 });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    let isAuthorized = false;

    if (authHeader.startsWith("Bearer vid_")) {
        const verified = await verifyApiKey(authHeader.slice("Bearer ".length));
        isAuthorized = verified !== null && verified.channel.id === video.channelId;
    } else {
        const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
        if (session?.user) {
            const memberRows = await db
                .select()
                .from(channelMembers)
                .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, session.user.id)))
                .limit(1);
            isAuthorized = !!memberRows[0];
        }
    }

    if (!isAuthorized) {
        return new Response(JSON.stringify({ error: "not authorized" }), {
            status: 401,
            headers: { "WWW-Authenticate": "Bearer" },
        });
    }

    // ---- 2. parse multipart ----

    if (!req.body) {
        return new Response(JSON.stringify({ error: "empty body" }), { status: 400 });
    }

    // We use a memory-backed Writable since caption files are tiny
    // (sub-megabyte). The multipart wrapper streams the file into this.
    const chunks: Buffer[] = [];
    const tmpWritable = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            cb();
        },
    });

    const headersDict = Object.fromEntries(req.headers.entries());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(req.body as any);

    let parsed: Awaited<ReturnType<typeof parseMultipart>>;
    try {
        parsed = await parseMultipart(nodeStream as unknown as IncomingMessage, {
            // 5 MB is comfortably above any realistic single-language WebVTT.
            maxFileBytes: 5 * 1024 * 1024,
            fileTarget: tmpWritable,
            headers: headersDict,
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
    }

    const lang = (parsed.fields["lang"] ?? "").trim();
    const label = (parsed.fields["label"] ?? "").trim() || lang;
    const isDefault = parsed.fields["isDefault"] === "true";

    if (!/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})?$/.test(lang)) {
        return new Response(JSON.stringify({ error: "invalid BCP-47 lang tag" }), { status: 400 });
    }

    const buf = Buffer.concat(chunks);
    if (buf.length === 0) {
        return new Response(JSON.stringify({ error: "empty caption file" }), { status: 400 });
    }
    // Sanity check: the file should start with WEBVTT.
    if (!buf.slice(0, 6).toString("utf8").startsWith("WEBVTT")) {
        return new Response(JSON.stringify({ error: "file does not look like WebVTT (must start with WEBVTT)" }), {
            status: 400,
        });
    }

    // ---- 3. write to disk ----

    const target = hlsCaptionsPath(videoId, lang);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buf);

    // ---- 4. upsert video_captions row ----

    // Composite uniq is (videoId, lang). Update on conflict.
    await db
        .insert(videoCaptions)
        .values({
            videoId,
            lang,
            label,
            source: "sidecar",
            vttPath: relative(paths.hlsRoot, target),
            isDefault,
        })
        .onConflictDoUpdate({
            target: [videoCaptions.videoId, videoCaptions.lang],
            set: {
                label,
                vttPath: relative(paths.hlsRoot, target),
                isDefault,
            },
        });

    // If the new track is default, ensure no other track for this video is.
    if (isDefault) {
        await db
            .update(videoCaptions)
            .set({ isDefault: false })
            .where(and(eq(videoCaptions.videoId, videoId)));
        await db
            .update(videoCaptions)
            .set({ isDefault: true })
            .where(and(eq(videoCaptions.videoId, videoId), eq(videoCaptions.lang, lang)));
    }

    return new Response(
        JSON.stringify({
            ok: true,
            lang,
            label,
            isDefault,
            url: `/api/hls/${videoId}/captions/${lang}.vtt`,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
    );
}
