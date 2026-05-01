import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { HlsAccessError, assertPlayableForRequest } from "@/lib/hls/access";
import { parseRange } from "@/lib/hls/range";
import { hlsSpriteJpgPath } from "@/lib/paths";
import { db } from "@/server/db/client";
import { videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> },
): Promise<NextResponse> {
    const { videoId } = await params;

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

    const filePath = hlsSpriteJpgPath(videoId);

    let fileSize: number;
    try {
        const st = await stat(filePath);
        fileSize = st.size;
    } catch {
        return new NextResponse("sprite not found", { status: 404 });
    }

    const rangeHeader = req.headers.get("range");

    if (!rangeHeader) {
        const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
        return new NextResponse(stream, {
            status: 200,
            headers: {
                "Content-Type": "image/jpeg",
                "Content-Length": String(fileSize),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }

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

    return new NextResponse(stream, {
        status: 206,
        headers: {
            "Content-Type": "image/jpeg",
            "Content-Length": String(length),
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}
