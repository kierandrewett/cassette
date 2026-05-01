import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { VideoGrid } from "@/components/video/VideoGrid";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { videos } from "@/server/db/schema/videos";

interface ChannelPageProps {
    params: Promise<{ handle: string }>;
}

// Default tab: Videos. Renders at /channel/<handle> directly. The shared
// layout (../layout.tsx) draws the header + tab nav around this content.
const ChannelPage = async ({ params }: ChannelPageProps) => {
    const { handle } = await params;

    const channel = await db
        .select({
            id: channels.id,
            name: channels.name,
            handle: channels.handle,
            avatarPath: channels.avatarPath,
            pinnedVideoId: channels.pinnedVideoId,
        })
        .from(channels)
        .where(eq(channels.handle, handle.toLowerCase()))
        .limit(1)
        .then((r) => r[0]);

    if (!channel) notFound();

    const channelVideos = await db
        .select({
            id: videos.id,
            title: videos.title,
            description: videos.description,
            thumbnailPath: videos.thumbnailPath,
            durationSec: videos.durationSec,
            viewCount: videos.viewCount,
            publishedAt: videos.publishedAt,
            publicId: videos.publicId,
        })
        .from(videos)
        .where(
            and(
                eq(videos.channelId, channel.id),
                eq(videos.privacy, "public"),
                eq(videos.status, "ready"),
                eq(videos.isDraft, false),
            ),
        )
        .orderBy(desc(videos.publishedAt))
        .limit(48)
        .catch(() => []);

    // Hoist the pinned trailer (if set) to the top of the list and render a
    // hero card above the grid. We still keep it in the grid so the layout
    // doesn't go from "12 videos" to "11 + a hero".
    const pinned = channel.pinnedVideoId ? (channelVideos.find((v) => v.id === channel.pinnedVideoId) ?? null) : null;

    const videoList = channelVideos.map((v) => ({
        ...v,
        channel: {
            id: channel.id,
            name: channel.name,
            handle: channel.handle,
            avatarPath: channel.avatarPath,
        },
    }));

    return (
        <div className="space-y-8">
            {pinned ? (
                <a
                    href={`/watch/${pinned.publicId ?? pinned.id}`}
                    className="block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2">
                        <div className="relative aspect-video bg-secondary">
                            {pinned.thumbnailPath ? (
                                // Hero thumbnail; sized lazily via Next/Image elsewhere — here we use a plain img to
                                // keep the channel page server-rendered and avoid an extra client island.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={`/api/hls/${pinned.id}/thumb/sprite.jpg`}
                                    alt={pinned.title}
                                    className="absolute inset-0 h-full w-full object-cover"
                                />
                            ) : null}
                            <span className="absolute left-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
                                Featured
                            </span>
                        </div>
                        <div className="flex flex-col justify-center gap-3 p-6">
                            <h2 className="line-clamp-2 text-xl font-semibold text-foreground">{pinned.title}</h2>
                            {pinned.description ? (
                                <p className="line-clamp-3 text-sm text-muted-foreground">{pinned.description}</p>
                            ) : null}
                            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                                Play
                            </span>
                        </div>
                    </div>
                </a>
            ) : null}

            <VideoGrid
                videos={videoList}
                emptySlot={<p className="text-sm text-muted-foreground">No public videos yet.</p>}
            />
        </div>
    );
};

export default ChannelPage;
