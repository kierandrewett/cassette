import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { type NextRequest, NextResponse } from "next/server";

import { channelAssetPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve channel avatar / banner images.
//
// The [file] segment is the stem only ("avatar" or "banner") — no extension.
// We probe the three supported extensions in preference order and stream the
// first one we find. This decouples the public URL from the on-disk format,
// so `/api/channel/<id>/asset/avatar` always resolves regardless of whether
// the operator uploaded a JPEG, PNG, or WebP.
//
// Cache-Control: public, max-age=300 — short enough to pick up updates within
// five minutes; long enough to avoid hammering the server on channel pages.

const EXTS = [".webp", ".jpg", ".png"] as const;

const CONTENT_TYPES: Record<string, string> = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".png": "image/png",
};

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ channelId: string; file: string }> },
): Promise<NextResponse> {
    const { channelId, file } = await params;

    // Only "avatar" and "banner" are valid stems.
    if (file !== "avatar" && file !== "banner") {
        return new NextResponse("not found", { status: 404 });
    }

    // Probe extensions in preference order.
    let resolvedPath: string | null = null;
    let resolvedExt: string | null = null;

    for (const ext of EXTS) {
        const candidate = channelAssetPath(channelId, file, ext);
        try {
            await stat(candidate);
            resolvedPath = candidate;
            resolvedExt = ext;
            break;
        } catch {
            // File does not exist — try next extension.
        }
    }

    if (!resolvedPath || !resolvedExt) {
        return new NextResponse("not found", { status: 404 });
    }

    const fileStat = await stat(resolvedPath);
    const contentType = CONTENT_TYPES[resolvedExt] ?? "application/octet-stream";

    const stream = Readable.toWeb(createReadStream(resolvedPath)) as ReadableStream<Uint8Array>;

    return new NextResponse(stream, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Content-Length": String(fileStat.size),
            "Cache-Control": "public, max-age=300",
        },
    });
}
