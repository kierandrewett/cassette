import { desc, eq, and } from "drizzle-orm";
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
    "\"": "&quot;",
    "'": "&apos;",
};

const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface Params {
    params: Promise<{ handle: string }>;
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
    const { handle } = await params;
    const normalHandle = handle.toLowerCase();

    // Look up the channel.
    const channelRows = await db
        .select({
            id: channels.id,
            handle: channels.handle,
            name: channels.name,
            description: channels.description,
        })
        .from(channels)
        .where(eq(channels.handle, normalHandle))
        .limit(1);

    const channel = channelRows[0];
    if (!channel) {
        return new Response("Not Found", { status: 404 });
    }

    // Fetch the 50 most-recent public+ready videos.
    const videoRows = await db
        .select({
            id: videos.id,
            title: videos.title,
            description: videos.description,
            thumbnailPath: videos.thumbnailPath,
            publishedAt: videos.publishedAt,
        })
        .from(videos)
        .where(
            and(
                eq(videos.channelId, channel.id),
                eq(videos.privacy, "public"),
                eq(videos.status, "ready"),
            ),
        )
        .orderBy(desc(videos.publishedAt))
        .limit(50);

    // ---------------------------------------------------------------------------
    // Build RSS 2.0 XML
    // ---------------------------------------------------------------------------

    // Derive a base URL. In production this will be set; in dev we fall back
    // to a placeholder that at least produces valid XML.
    const baseUrl = process.env["NEXT_PUBLIC_BASE_URL"]?.replace(/\/$/, "") ?? "http://localhost:3000";

    const channelLink = `${baseUrl}/c/${escapeXml(channel.handle)}`;

    const items = videoRows.map((v) => {
        const link = `${baseUrl}/watch/${escapeXml(v.id)}`;
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
        <description>${description}</description>${enclosureEl}
    </item>`;
    }).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.name)}</title>
    <link>${channelLink}</link>
    <description>${escapeXml(channel.description ?? "")}</description>
    <language>en</language>
    <atom:link href="${baseUrl}/c/${escapeXml(channel.handle)}/feed.xml" rel="self" type="application/rss+xml" />
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
