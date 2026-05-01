import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { HlsAccessError, assertPlayableForRequest } from "@/lib/hls/access";
import { type PlaylistCredential, rewriteVariantPlaylist } from "@/lib/hls/playlist";
import { db } from "@/server/db/client";
import { videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string; variant: string }> },
): Promise<NextResponse> {
    const { videoId, variant } = await params;

    // Load video row.
    const rows = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
    const video = rows[0];

    if (!video) {
        return new NextResponse("not found", { status: 404 });
    }

    // Privacy guard.
    let accessResult: { token?: string };
    try {
        accessResult = assertPlayableForRequest(video, req);
    } catch (err) {
        if (err instanceof HlsAccessError) {
            return new NextResponse(err.message, { status: err.status });
        }
        throw err;
    }

    // Build the credential to embed in rewritten segment URIs.
    let credential: PlaylistCredential;

    if (video.privacy === "public") {
        credential = { kind: "none" };
    } else if (video.privacy === "unlisted") {
        const slug = req.nextUrl.searchParams.get("slug");
        if (accessResult.token && slug) {
            credential = { kind: "slug-and-token", slug, token: accessResult.token };
        } else if (accessResult.token) {
            credential = { kind: "token", token: accessResult.token };
        } else if (slug) {
            credential = { kind: "slug", slug };
        } else {
            credential = { kind: "none" };
        }
    } else {
        // private: token is mandatory
        credential = accessResult.token ? { kind: "token", token: accessResult.token } : { kind: "none" };
    }

    let body: string;
    try {
        body = await rewriteVariantPlaylist(videoId, variant, credential);
    } catch {
        return new NextResponse("playlist not found", { status: 404 });
    }

    const isPublic = video.privacy === "public";
    const cacheControl = isPublic ? "public, max-age=60" : "no-store";

    return new NextResponse(body, {
        status: 200,
        headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": cacheControl,
        },
    });
}
