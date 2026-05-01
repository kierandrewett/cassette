import { redirect } from "next/navigation";
import type { Metadata } from "next";

import AppShell from "@/components/shell/AppShell";
import { CreatePlaylistTile } from "@/components/library/CreatePlaylistTile";
import { PlaylistTile } from "@/components/library/PlaylistTile";
import { getSession } from "@/lib/session";
import { trpc } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Playlists" };

// Dedicated playlists page — the user-facing destination of the Playlists
// entry in the LeftRail. Lists every user-kind playlist owned by the
// signed-in viewer, plus a "+ New playlist" tile that opens the create
// dialog. Distinct from /library which shows playlists *as one shelf among
// many*; this surface is just playlists.
const PlaylistsPage = async () => {
    const session = await getSession();
    if (!session?.user) {
        redirect("/login?next=/playlists");
    }

    const playlists = await trpc.playlist.list({});

    return (
        <AppShell>
            <div className="px-4 py-8 md:px-6 lg:px-8">
                <header className="mb-6 flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Your playlists</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}
                        </p>
                    </div>
                </header>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {playlists.map((p) => (
                        <PlaylistTile key={p.id} id={p.id} title={p.title} privacy={p.privacy} />
                    ))}
                    <CreatePlaylistTile />
                </div>
            </div>
        </AppShell>
    );
};

export default PlaylistsPage;
