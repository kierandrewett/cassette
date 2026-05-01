"use client";

import { useState } from "react";
import { Plus, Check, List } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddToPlaylistButtonProps {
    videoId: string;
}

type Privacy = "public" | "unlisted" | "private";

// Inline "create playlist" form rendered as a DropdownMenuItem-like panel.
const CreatePlaylistForm = ({
    videoId,
    onCreated,
    onCancel,
}: {
    videoId: string;
    onCreated: () => void;
    onCancel: () => void;
}) => {
    const [title, setTitle] = useState("");
    const [privacy, setPrivacy] = useState<Privacy>("private");

    const utils = api.useUtils();
    const createPlaylist = api.playlist.create.useMutation({
        onSuccess: () => utils.playlist.list.invalidate(),
    });
    const addItem = api.playlist.addItem.useMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        try {
            const playlist = await createPlaylist.mutateAsync({ title: title.trim(), privacy });
            await addItem.mutateAsync({ playlistId: playlist.id, videoId });
            toast.success(`Added to "${playlist.title}"`);
            onCreated();
        } catch {
            toast.error("Failed to create playlist. Please try again.");
        }
    };

    const busy = createPlaylist.isPending || addItem.isPending;

    return (
        <form
            onSubmit={handleSubmit}
            className="px-3 py-2 space-y-2"
            // Prevent the dropdown from closing when clicking inside the form.
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <div className="space-y-1">
                <Label htmlFor="new-playlist-title" className="text-xs">
                    Playlist title
                </Label>
                <Input
                    id="new-playlist-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My playlist"
                    className="h-7 text-xs"
                    autoFocus
                    maxLength={200}
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="new-playlist-privacy" className="text-xs">
                    Privacy
                </Label>
                <select
                    id="new-playlist-privacy"
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as Privacy)}
                    className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                </select>
            </div>
            <div className="flex gap-2 pt-1">
                <button
                    type="submit"
                    disabled={busy || !title.trim()}
                    className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    {busy ? "Creating…" : "Create"}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
};

export const AddToPlaylistButton = ({ videoId }: AddToPlaylistButtonProps) => {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    const { data: playlists } = api.playlist.list.useQuery(
        {},
        { enabled: !!session?.user && open },
    );

    const addToQueue = api.playlist.queue.add.useMutation({
        onSuccess: () => toast.success("Added to queue"),
        onError: () => toast.error("Failed to add to queue"),
    });

    const addToWatchLater = api.playlist.watchLater.add.useMutation({
        onSuccess: () => toast.success("Saved to Watch Later"),
        onError: () => toast.error("Failed to save to Watch Later"),
    });

    const addItem = api.playlist.addItem.useMutation({
        onSuccess: (_data, vars) => {
            const pl = playlists?.find((p) => p.id === vars.playlistId);
            toast.success(pl ? `Added to "${pl.title}"` : "Added to playlist");
        },
        onError: () => toast.error("Failed to add to playlist"),
    });

    if (!session?.user) {
        // Unauthenticated: render a "Sign in to save" link instead.
        return (
            <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-lg bg-secondary/80 px-2.5 py-1.5 text-xs font-medium text-foreground/80 hover:bg-secondary hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
            >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Sign in to save
            </Link>
        );
    }

    const userPlaylists = playlists ?? [];

    return (
        <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowCreate(false); }}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-md bg-black/60 hover:bg-black/80 text-white"
                    aria-label="Save to playlist"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                className="w-56"
                onClick={(e) => e.stopPropagation()}
            >
                {/* System actions */}
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); addToQueue.mutate({ videoId }); setOpen(false); }}
                    disabled={addToQueue.isPending}
                >
                    <List className="mr-2 h-4 w-4" aria-hidden="true" />
                    Add to queue
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); addToWatchLater.mutate({ videoId }); setOpen(false); }}
                    disabled={addToWatchLater.isPending}
                >
                    <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                    Add to Watch Later
                </DropdownMenuItem>

                {userPlaylists.length > 0 && <DropdownMenuSeparator />}

                {/* User playlists */}
                {userPlaylists.map((pl) => (
                    <DropdownMenuItem
                        key={pl.id}
                        onSelect={(e) => { e.preventDefault(); addItem.mutate({ playlistId: pl.id, videoId }); setOpen(false); }}
                        disabled={addItem.isPending}
                    >
                        <span className="truncate">{pl.title}</span>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />

                {/* Create new playlist */}
                {showCreate ? (
                    <CreatePlaylistForm
                        videoId={videoId}
                        onCreated={() => { setShowCreate(false); setOpen(false); }}
                        onCancel={() => setShowCreate(false)}
                    />
                ) : (
                    <DropdownMenuItem
                        onSelect={(e) => { e.preventDefault(); setShowCreate(true); }}
                    >
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        + Create new playlist
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
