// Authenticated route that returns an OPML document of the user's channel
// subscriptions. Compatible with RSS readers that support OPML import.

import { headers } from "next/headers";
import { type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { subscriptions } from "@/server/db/schema/social";

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
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        return new Response("Unauthorised", { status: 401 });
    }

    const userId = session.user.id;
    const baseUrl = process.env["NEXT_PUBLIC_BASE_URL"]?.replace(/\/$/, "") ?? "http://localhost:3000";

    // Fetch all subscriptions for this user, joined with channel info.
    const rows = await db
        .select({
            handle: channels.handle,
            name: channels.name,
        })
        .from(subscriptions)
        .innerJoin(channels, eq(subscriptions.channelId, channels.id))
        .where(eq(subscriptions.userId, userId))
        .orderBy(channels.name);

    const outlines = rows
        .map((ch) => {
            const htmlUrl = `${baseUrl}/c/${escapeXml(ch.handle)}`;
            const xmlUrl = `${baseUrl}/c/${escapeXml(ch.handle)}/feed.xml`;
            const text = escapeXml(ch.name);
            return `        <outline type="rss" text="${text}" title="${text}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}" />`;
        })
        .join("\n");

    const date = new Date().toUTCString();
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>cassette subscriptions</title>
    <dateCreated>${date}</dateCreated>
  </head>
  <body>
    <outline text="Subscriptions" title="Subscriptions">
${outlines}
    </outline>
  </body>
</opml>`;

    const safeName = (session.user.name ?? "subscriptions").replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const filename = `cassette-subscriptions-${safeName}.opml`;

    return new Response(opml, {
        status: 200,
        headers: {
            "Content-Type": "text/x-opml; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, no-store",
        },
    });
}
