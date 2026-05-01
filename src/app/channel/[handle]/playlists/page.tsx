import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";
import { playlists } from "@/server/db/schema/playlists";

interface PlaylistsTabPageProps {
    params: Promise<{ handle: string }>;
}

// Renders the Playlists tab at /channel/<handle>/playlists. Public user-kind
// playlists owned by the channel's owner.
const ChannelPlaylistsTabPage = async ({ params }: PlaylistsTabPageProps) => {
    const { handle } = await params;

    const channel = await db
        .select({ id: channels.id, ownerId: channels.ownerId })
        .from(channels)
        .where(eq(channels.handle, handle.toLowerCase()))
        .limit(1)
        .then((r) => r[0]);

    if (!channel) notFound();

    const channelPlaylists = await db
        .select({
            id: playlists.id,
            title: playlists.title,
            privacy: playlists.privacy,
        })
        .from(playlists)
        .where(
            and(
                eq(playlists.ownerId, channel.ownerId),
                eq(playlists.kind, "user"),
                eq(playlists.privacy, "public"),
            ),
        )
        .orderBy(desc(playlists.updatedAt))
        .catch(() => []);

    if (channelPlaylists.length === 0) {
        return <p className="py-20 text-center text-sm text-muted-foreground">No public playlists yet.</p>;
    }

    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {channelPlaylists.map((pl) => (
                <a
                    key={pl.id}
                    href={`/playlist/${pl.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:bg-secondary"
                >
                    <div className="flex aspect-video items-center justify-center rounded-lg bg-secondary text-2xl text-muted-foreground">
                        &#9654;
                    </div>
                    <span className="line-clamp-2 font-medium text-foreground">{pl.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{pl.privacy}</span>
                </a>
            ))}
        </div>
    );
};

export default ChannelPlaylistsTabPage;
