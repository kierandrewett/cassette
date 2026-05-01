import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Bookmark, Pencil, Play, Shuffle } from "lucide-react";

import AppShell from "@/components/shell/AppShell";
import { PlaylistHero } from "@/components/playlist/PlaylistHero";
import { PlaylistItemList } from "@/components/playlist/PlaylistItemList";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { playlistItems, playlists } from "@/server/db/schema/playlists";
import { videos } from "@/server/db/schema/videos";
import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";

interface PlaylistPageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PlaylistPageProps): Promise<Metadata> {
    const { id } = await params;
    const playlist = await db
        .select({ title: playlists.title })
        .from(playlists)
        .where(eq(playlists.id, id))
        .limit(1)
        .then((r) => r[0]);
    return { title: playlist?.title ?? "Playlist" };
}

const PlaylistPage = async ({ params }: PlaylistPageProps) => {
    const { id } = await params;

    const session = await auth.api.getSession({ headers: await headers() });

    const playlist = await db
        .select()
        .from(playlists)
        .where(eq(playlists.id, id))
        .limit(1)
        .then((r) => r[0]);

    if (!playlist) notFound();

    // Privacy gate.
    if (playlist.privacy === "private") {
        if (!session?.user || session.user.id !== playlist.ownerId) {
            notFound();
        }
    }

    const isOwner = !!session?.user && session.user.id === playlist.ownerId;

    const items = await db
        .select({
            itemId: playlistItems.id,
            position: playlistItems.position,
            addedAt: playlistItems.addedAt,
            video: {
                id: videos.id,
                title: videos.title,
                thumbnailPath: videos.thumbnailPath,
                durationSec: videos.durationSec,
                viewCount: videos.viewCount,
                publishedAt: videos.publishedAt,
            },
            channel: {
                name: channels.name,
                handle: channels.handle,
            },
        })
        .from(playlistItems)
        .innerJoin(videos, eq(videos.id, playlistItems.videoId))
        .innerJoin(channels, eq(channels.id, videos.channelId))
        .where(eq(playlistItems.playlistId, playlist.id))
        .orderBy(asc(playlistItems.position))
        .limit(200);

    const thumbnails = items
        .filter((it) => it.video.thumbnailPath)
        .slice(0, 4)
        .map((it) => `/api/hls/${it.video.id}/thumb/sprite.jpg`);

    const totalRuntimeSec = items.reduce((acc, it) => acc + (it.video.durationSec ?? 0), 0);
    const firstVideoId = items[0]?.video.id;

    return (
        <AppShell>
            <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
                    {/* Left rail: hero + actions */}
                    <div className="space-y-4">
                        <PlaylistHero
                            title={playlist.title}
                            description={playlist.description || undefined}
                            thumbnails={thumbnails}
                            itemCount={items.length}
                            totalRuntimeSec={totalRuntimeSec}
                            privacy={playlist.privacy}
                        />

                        <div className="flex flex-wrap gap-2">
                            {firstVideoId && (
                                <Button asChild size="sm">
                                    <Link href={`/watch/${firstVideoId}`}>
                                        <Play className="mr-1.5 h-4 w-4" />
                                        Play all
                                    </Link>
                                </Button>
                            )}
                            {firstVideoId && (
                                <Button variant="secondary" size="sm" asChild>
                                    <Link href={`/watch/${firstVideoId}?shuffle=1`}>
                                        <Shuffle className="mr-1.5 h-4 w-4" />
                                        Shuffle play
                                    </Link>
                                </Button>
                            )}
                            {isOwner && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={`/playlist/${playlist.id}/edit`}>
                                        <Pencil className="mr-1.5 h-4 w-4" />
                                        Edit
                                    </Link>
                                </Button>
                            )}
                            {!isOwner && session?.user && (
                                <Button variant="outline" size="sm">
                                    <Bookmark className="mr-1.5 h-4 w-4" />
                                    Save
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Right column: item list */}
                    <div>
                        <h2 className="mb-4 text-base font-semibold text-foreground">
                            {items.length} {items.length === 1 ? "video" : "videos"}
                        </h2>
                        <PlaylistItemList
                            playlistId={playlist.id}
                            items={items}
                            isOwner={isOwner}
                            onMutated={() => {
                                // Server component cannot respond to client mutations.
                                // The next navigation will refresh server data.
                            }}
                        />
                    </div>
                </div>
            </div>
        </AppShell>
    );
};

export default PlaylistPage;
