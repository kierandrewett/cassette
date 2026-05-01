import Link from "next/link";
import { ListVideo } from "lucide-react";

export interface SearchPlaylistResult {
    id: string;
    title: string;
    description: string;
    ownerName: string;
    itemCount: number;
}

// Horizontal playlist result card used in /search?tab=playlists.
export const SearchPlaylistCard = ({ playlist }: { playlist: SearchPlaylistResult }) => {
    return (
        <Link
            href={`/playlist/${playlist.id}`}
            className="flex items-center gap-4 rounded-2xl px-4 py-3 transition hover:bg-accent/40"
            aria-label={`Playlist: ${playlist.title} by ${playlist.ownerName}`}
        >
            <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-muted-foreground">
                <ListVideo className="h-8 w-8" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-base font-semibold text-foreground">{playlist.title}</p>
                <p className="truncate text-sm text-muted-foreground">
                    {playlist.ownerName} · {playlist.itemCount} video{playlist.itemCount === 1 ? "" : "s"}
                </p>
                {playlist.description ? (
                    <p className="line-clamp-2 max-w-xl text-sm text-muted-foreground/80">{playlist.description}</p>
                ) : null}
            </div>
        </Link>
    );
};
