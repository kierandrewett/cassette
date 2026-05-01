import { Readable, Writable } from "node:stream";
import { type IncomingMessage } from "node:http";
import { writeFile } from "node:fs/promises";
import { relative } from "node:path";

import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { auth, verifyApiKey } from "@/lib/auth";
import { hlsThumbnailPath, paths } from "@/lib/paths";
import { parseMultipart } from "@/lib/upload/multipart";
import { db } from "@/server/db/client";
import { channelMembers } from "@/server/db/schema/channels";
import { videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Magic-byte signatures for accepted image formats.
const IMAGE_MAGIC: Array<{ mime: string; bytes: number[]; offset?: number }> = [
    // JPEG: FF D8 FF
    { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    // WebP: RIFF????WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
    { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const detectMagic = (buf: Buffer): boolean => {
    for (const sig of IMAGE_MAGIC) {
        const off = sig.offset ?? 0;
        if (buf.length < off + sig.bytes.length) continue;
        const match = sig.bytes.every((b, i) => buf[off + i] === b);
        if (!match) continue;

        // Extra check for WebP: bytes 8-11 must be 'WEBP'.
        if (sig.mime === "image/webp") {
            if (buf.length < 12) continue;
            const webp = buf.slice(8, 12).toString("ascii");
            if (webp !== "WEBP") continue;
        }

        return true;
    }
    return false;
};

// ---------------------------------------------------------------------------
// POST /api/upload/[videoId]/thumbnail
//
// Replaces the video thumbnail with a user-uploaded image.
// Auth: API key OR session + channel membership.
// Body: multipart/form-data, single field `file` (jpg/png/webp, ≤ 5 MB).
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: { params: Promise<{ videoId: string }> }): Promise<Response> {
    const { videoId } = await params;

    // ---- 1. Load video ----

    const videoRows = await db
        .select({ channelId: videos.channelId })
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);
    const video = videoRows[0];
    if (!video) {
        return json(404, { error: "video not found" });
    }

    // ---- 2. Auth ----

    const authHeader = req.headers.get("authorization") ?? "";
    let isAuthorised = false;

    if (authHeader.startsWith("Bearer vid_")) {
        const verified = await verifyApiKey(authHeader.slice("Bearer ".length));
        isAuthorised = verified !== null && verified.channel.id === video.channelId;
    } else {
        const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
        if (session?.user) {
            const memberRows = await db
                .select({ role: channelMembers.role })
                .from(channelMembers)
                .where(and(eq(channelMembers.channelId, video.channelId), eq(channelMembers.userId, session.user.id)))
                .limit(1);
            isAuthorised = !!memberRows[0];
        }
    }

    if (!isAuthorised) {
        return new Response(JSON.stringify({ error: "not authorised" }), {
            status: 401,
            headers: { "WWW-Authenticate": "Bearer", "Content-Type": "application/json" },
        });
    }

    // ---- 3. Parse multipart ----

    if (!req.body) {
        return json(400, { error: "empty body" });
    }

    const chunks: Buffer[] = [];
    const memWritable = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
            cb();
        },
    });

    const headersDict = Object.fromEntries(req.headers.entries());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(req.body as any);

    let parsed: Awaited<ReturnType<typeof parseMultipart>>;
    try {
        parsed = await parseMultipart(nodeStream as unknown as IncomingMessage, {
            maxFileBytes: MAX_BYTES,
            fileTarget: memWritable,
            headers: headersDict,
        });
    } catch (err) {
        if (err instanceof Error && err.message.includes("exceeds maximum size")) {
            return json(413, { error: "image exceeds 5 MB limit" });
        }
        return json(400, { error: (err as Error).message });
    }

    void parsed; // fields are not required beyond the file

    const buf = Buffer.concat(chunks);

    // ---- 4. Validate image ----

    if (buf.length === 0) {
        return json(400, { error: "empty file" });
    }

    if (!detectMagic(buf)) {
        return json(415, { error: "unsupported image format — must be JPEG, PNG or WebP" });
    }

    // ---- 5. Write thumbnail to disk ----

    const thumbPath = hlsThumbnailPath(videoId);
    await writeFile(thumbPath, buf);

    // ---- 6. Ensure DB row points to the correct relative path ----

    const relPath = relative(paths.hlsRoot, thumbPath);

    await db.update(videos).set({ thumbnailPath: relPath, updatedAt: new Date() }).where(eq(videos.id, videoId));

    return json(200, {
        ok: true,
        thumbnailPath: relPath,
        url: `/api/hls/${videoId}/thumb/sprite.jpg`,
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (status: number, body: object): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
