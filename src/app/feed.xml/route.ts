// Site-wide RSS 2.0 feed — the 50 most-recent public+ready videos across all
// channels. Useful for autodiscovery via the <link rel="alternate"> tag added
// to the root layout, and for aggregators that want a single site feed.

import { and, desc, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// XML entity escaping
// ---------------------------------------------------------------------------

const ESC: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
};

const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest): Promise<Response> {
    const baseUrl = process.env["NEXT_PUBLIC_BASE_URL"]?.replace(/\/$/, "") ?? "http://localhost:3000";

    // Fetch the 50 most-recent public+ready videos across all channels.
    const rows = await db
        .select({
            id: videos.id,
            title: videos.title,
            description: videos.description,
            thumbnailPath: videos.thumbnailPath,
            publishedAt: videos.publishedAt,
            channelId: videos.channelId,
            channelHandle: channels.handle,
            channelName: channels.name,
        })
        .from(videos)
        .innerJoin(channels, eq(videos.channelId, channels.id))
        .where(and(eq(videos.privacy, "public"), eq(videos.status, "ready")))
        .orderBy(desc(videos.publishedAt))
        .limit(50);

    const items = rows
        .map((v) => {
            const link = `${baseUrl}/watch/${escapeXml(v.id)}`;
            const channelFeed = `${baseUrl}/channel/${escapeXml(v.channelHandle)}/feed.xml`;
            const pubDate = v.publishedAt ? v.publishedAt.toUTCString() : new Date(0).toUTCString();
            const description = escapeXml((v.description ?? "").slice(0, 500));
            const title = escapeXml(v.title);

            const enclosureEl = v.thumbnailPath
                ? `\n        <enclosure url="${baseUrl}/api/hls/${escapeXml(v.id)}/thumb/sprite.jpg" type="image/jpeg" length="0" />`
                : "";

            return `
    <item>
        <title>${title}</title>
        <link>${link}</link>
        <guid isPermaLink="true">${link}</guid>
        <pubDate>${pubDate}</pubDate>
        <description>${description}</description>
        <source url="${channelFeed}">${escapeXml(v.channelName)}</source>${enclosureEl}
    </item>`;
        })
        .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>cassette · all uploads</title>
    <link>${baseUrl}</link>
    <description>The 50 most-recent public videos across all channels on this cassette instance.</description>
    <language>en</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
        },
    });
}
