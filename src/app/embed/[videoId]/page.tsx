import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata, Viewport } from "next";

import { Player } from "@/components/player/Player";
import { signToken } from "@/lib/hls/sign";
import { auth } from "@/lib/auth";
import { looksLikeUuid } from "@/lib/slug";
import { parseTimestamp } from "@/lib/timestamp";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { videoCaptions, videoChapters, videoVariants, videos } from "@/server/db/schema/videos";
import { eq, asc } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    themeColor: "#000000",
    colorScheme: "dark",
};

interface EmbedPageProps {
    params: Promise<{ videoId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const safeEqual = (a: string, b: string): boolean => {
    try {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ab.length !== bb.length) return false;
        return timingSafeEqual(ab, bb);
    } catch {
        return false;
    }
};

// /embed/<videoId> renders only the player, intended to be hosted in an
// <iframe>. No header, no comments, no sidebar — just the canvas. The same
// privacy gate as /watch applies: public always allowed, unlisted requires
// ?slug=, private requires the caller to be a channel member (we mint the
// HLS-signed token here on the server so the iframe never holds the API key).
const EmbedPage = async ({ params, searchParams }: EmbedPageProps) => {
    const { videoId } = await params;
    const sp = await searchParams;
    const slug = typeof sp["slug"] === "string" ? sp["slug"] : null;

    // Embed customisation query params.
    const autoplay = sp["autoplay"] === "1";
    const muted = sp["muted"] === "1" || autoplay; // muted=1 implied when autoplay=1
    const loop = sp["loop"] === "1";
    const controls = sp["controls"] === "0" ? ("hidden" as const) : ("auto" as const);
    // ?t= takes precedence over the legacy ?start=<int> param. Both can be raw
    // seconds ("123") or human form ("1m23s"). Falls back to undefined.
    const tParam = typeof sp["t"] === "string" ? sp["t"] : null;
    const startParam = typeof sp["start"] === "string" ? sp["start"] : null;
    const startSec = parseTimestamp(tParam) ?? parseTimestamp(startParam) ?? undefined;

    // Look up by either UUID or publicId. `looksLikeUuid` catches the canonical
    // UUID shape; anything else is treated as the short publicId.
    const isUuid = looksLikeUuid(videoId);
    const videoRows = await db
        .select()
        .from(videos)
        .where(isUuid ? eq(videos.id, videoId) : eq(videos.publicId, videoId))
        .limit(1);
    const video = videoRows[0];
    if (!video || video.status !== "ready") {
        notFound();
    }

    // Canonicalise to the short publicId form. Preserve the rest of the
    // query string so embedders' deep links survive the redirect.
    if (isUuid && video.publicId && video.publicId !== videoId) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(sp)) {
            if (typeof v === "string") qs.set(k, v);
        }
        const tail = qs.toString();
        permanentRedirect(`/embed/${video.publicId}${tail ? `?${tail}` : ""}`);
    }

    if (video.privacy === "unlisted") {
        if (!slug || !video.unlistedSlug || !safeEqual(slug, video.unlistedSlug)) {
            notFound();
        }
    }

    let signedToken: string | null = null;
    if (video.privacy === "private") {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user) notFound();
        signedToken = signToken({ videoId: video.id, userId: session.user.id, ttlSec: 4 * 3600 });
    }

    const [channelRows, captions, chapters, variants] = await Promise.all([
        db.select().from(channels).where(eq(channels.id, video.channelId)).limit(1),
        db.select().from(videoCaptions).where(eq(videoCaptions.videoId, video.id)).orderBy(asc(videoCaptions.lang)),
        db.select().from(videoChapters).where(eq(videoChapters.videoId, video.id)).orderBy(asc(videoChapters.startSec)),
        db.select().from(videoVariants).where(eq(videoVariants.videoId, video.id)).orderBy(asc(videoVariants.height)),
    ]);

    const channel = channelRows[0]!;

    return (
        <div className="fixed inset-0 bg-black">
            <Player
                video={video}
                captions={captions}
                chapters={chapters}
                variants={variants}
                signedToken={signedToken}
                queueNext={null}
                channel={{
                    handle: channel.handle,
                    name: channel.name,
                    avatarPath: channel.avatarPath,
                }}
                autoplay={autoplay}
                muted={muted}
                loop={loop}
                controls={controls}
                startSec={startSec}
            />
        </div>
    );
};

export default EmbedPage;
