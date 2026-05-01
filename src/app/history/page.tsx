import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/shell/AppShell";
import { HistoryPageClient } from "./HistoryPageClient";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { watchHistory } from "@/server/db/schema/history";
import { videos } from "@/server/db/schema/videos";
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Watch History" };

const HistoryPage = async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        redirect("/login");
    }
    const userId = session.user.id;

    // Load the first page of history server-side for instant render.
    const initialItems = await db
        .select({
            historyId: watchHistory.id,
            watchedAt: watchHistory.watchedAt,
            video: {
                id: videos.id,
                title: videos.title,
                thumbnailPath: videos.thumbnailPath,
                durationSec: videos.durationSec,
                viewCount: videos.viewCount,
                publishedAt: videos.publishedAt,
            },
            channel: { name: channels.name, handle: channels.handle },
        })
        .from(watchHistory)
        .innerJoin(videos, eq(videos.id, watchHistory.videoId))
        .innerJoin(channels, eq(channels.id, videos.channelId))
        .where(eq(watchHistory.userId, userId))
        .orderBy(desc(watchHistory.watchedAt))
        .limit(50)
        .catch(() => []);

    return (
        <AppShell>
            <div className="mx-auto max-w-3xl py-8">
                <HistoryPageClient initialItems={initialItems} />
            </div>
        </AppShell>
    );
};

export default HistoryPage;
