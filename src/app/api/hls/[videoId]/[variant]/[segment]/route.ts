import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { HlsAccessError, assertPlayableForRequest } from "@/lib/hls/access";
import { parseRange } from "@/lib/hls/range";
import { recordBandwidth } from "@/lib/metrics/bandwidth";
import { hlsSegmentPath } from "@/lib/paths";
import { db } from "@/server/db/client";
import { videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";

// Anti-traversal: only allow segment filenames matching `seg-<1-8 digits>.ts`.
const SEGMENT_RE = /^seg-\d{1,8}\.ts$/;

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string; variant: string; segment: string }> },
): Promise<NextResponse> {
    const { videoId, variant, segment } = await params;

    // Anti-traversal guard: reject any segment name that doesn't look like a
    // normal ffmpeg-generated segment file.
    if (!SEGMENT_RE.test(segment)) {
        return new NextResponse("invalid segment name", { status: 400 });
    }

    // Load video row.
    const rows = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    const video = rows[0];

    if (!video) {
        return new NextResponse("not found", { status: 404 });
    }

    // Privacy guard.
    try {
        assertPlayableForRequest(video, req);
    } catch (err) {
        if (err instanceof HlsAccessError) {
            return new NextResponse(err.message, { status: err.status });
        }
        throw err;
    }

    const filePath = hlsSegmentPath(videoId, variant, segment);

    // Stat the file.
    let fileSize: number;
    try {
        const st = await stat(filePath);
        fileSize = st.size;
    } catch {
        return new NextResponse("segment not found", { status: 404 });
    }

    const rangeHeader = req.headers.get("range");

    if (!rangeHeader) {
        // Full file response.
        const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
        // Record bandwidth fire-and-forget — must not await before returning.
        void recordBandwidth({ channelId: video.channelId, bytes: fileSize });
        return new NextResponse(stream, {
            status: 200,
            headers: {
                "Content-Type": "video/MP2T",
                "Content-Length": String(fileSize),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }

    // Partial content response.
    const parsed = parseRange(rangeHeader, fileSize);
    if (!parsed.ok) {
        return new NextResponse(parsed.reason, {
            status: 416,
            headers: {
                "Content-Range": `bytes */${fileSize}`,
            },
        });
    }

    const { start, end, length } = parsed;
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;

    // Record bandwidth fire-and-forget — must not await before returning.
    void recordBandwidth({ channelId: video.channelId, bytes: length });
    return new NextResponse(stream, {
        status: 206,
        headers: {
            "Content-Type": "video/MP2T",
            "Content-Length": String(length),
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}
