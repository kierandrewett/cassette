import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/shell/AppShell";
import { VideoGrid } from "@/components/video/VideoGrid";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { subscriptions } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Subscriptions" };

const SubscriptionsPage = async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        redirect("/login");
    }
    const userId = session.user.id;

    // Collect subscribed channel IDs.
    const subRows = await db
        .select({ channelId: subscriptions.channelId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId));

    const videoList =
        subRows.length > 0
            ? await db
                  .select({
                      id: videos.id,
                      title: videos.title,
                      thumbnailPath: videos.thumbnailPath,
                      durationSec: videos.durationSec,
                      viewCount: videos.viewCount,
                      publishedAt: videos.publishedAt,
                      channel: { name: channels.name, handle: channels.handle },
                  })
                  .from(videos)
                  .innerJoin(channels, eq(channels.id, videos.channelId))
                  .where(
                      and(
                          inArray(
                              videos.channelId,
                              subRows.map((r) => r.channelId),
                          ),
                          eq(videos.privacy, "public"),
                          eq(videos.status, "ready"),
                      ),
                  )
                  .orderBy(desc(videos.publishedAt))
                  .limit(48)
            : [];

    return (
        <AppShell>
            <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
                <h1 className="mb-6 text-2xl font-semibold text-foreground">Subscriptions</h1>
                <VideoGrid
                    videos={videoList}
                    emptySlot={
                        <p className="text-sm text-muted-foreground">
                            You have no subscriptions yet. Visit a channel and subscribe to see its latest videos here.
                        </p>
                    }
                />
            </div>
        </AppShell>
    );
};

export default SubscriptionsPage;
