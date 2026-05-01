"use client";

import { useState } from "react";
import { Plus, Check, Clock, ListVideo } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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
            className="space-y-2 px-3 py-2"
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
                    className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                    className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                    {busy ? "Creating…" : "Create"}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
    const [queueAdded, setQueueAdded] = useState(false);
    const [watchLaterAdded, setWatchLaterAdded] = useState(false);

    const { data: playlists } = api.playlist.list.useQuery({}, { enabled: !!session?.user && open });

    const addToQueue = api.playlist.queue.add.useMutation({
        onMutate: () => setQueueAdded(true),
        onError: () => {
            setQueueAdded(false);
            toast.error("Failed to add to queue");
        },
        onSuccess: () => toast.success("Added to queue"),
    });

    const addToWatchLater = api.playlist.watchLater.add.useMutation({
        onMutate: () => setWatchLaterAdded(true),
        onError: () => {
            setWatchLaterAdded(false);
            toast.error("Failed to save to Watch Later");
        },
        onSuccess: () => toast.success("Saved to Watch Later"),
    });

    const addItem = api.playlist.addItem.useMutation({
        onSuccess: (_data, vars) => {
            const pl = playlists?.find((p) => p.id === vars.playlistId);
            toast.success(pl ? `Added to "${pl.title}"` : "Added to playlist");
        },
        onError: () => toast.error("Failed to add to playlist"),
    });

    // Signed-out viewers don't see the playlist button at all. The whole
    // card already navigates to /watch/<id>; surfacing a "Sign in to save"
    // pill in the corner just bleeds past the duration badge and reads as
    // broken UI. Sign-in CTAs live in the action row on the watch page.
    if (!session?.user) return null;

    const userPlaylists = playlists ?? [];

    return (
        <DropdownMenu
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) setShowCreate(false);
            }}
        >
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full bg-white/15 text-white shadow-sm ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    aria-label="Save to playlist"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuLabel>Save video to…</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* System destinations: queue + watch later. Each row uses
                    its own semantic icon (ListVideo for queue, Clock for
                    Watch Later — Check used to be on Watch Later, which
                    incorrectly read as "already saved"). A right-aligned
                    Check appears AFTER the action succeeds. */}
                <DropdownMenuItem
                    onSelect={(e) => {
                        e.preventDefault();
                        if (!queueAdded) addToQueue.mutate({ videoId });
                        setOpen(false);
                    }}
                    disabled={addToQueue.isPending || queueAdded}
                    className="justify-between gap-3"
                >
                    <span className="flex items-center gap-2">
                        <ListVideo className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Add to queue
                    </span>
                    {queueAdded && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={(e) => {
                        e.preventDefault();
                        if (!watchLaterAdded) addToWatchLater.mutate({ videoId });
                        setOpen(false);
                    }}
                    disabled={addToWatchLater.isPending || watchLaterAdded}
                    className="justify-between gap-3"
                >
                    <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Watch Later
                    </span>
                    {watchLaterAdded && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                </DropdownMenuItem>

                {userPlaylists.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                            Your playlists
                        </DropdownMenuLabel>
                        {userPlaylists.map((pl) => (
                            <DropdownMenuItem
                                key={pl.id}
                                onSelect={(e) => {
                                    e.preventDefault();
                                    addItem.mutate({ playlistId: pl.id, videoId });
                                    setOpen(false);
                                }}
                                disabled={addItem.isPending}
                                className="gap-2"
                            >
                                <ListVideo className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                <span className="truncate">{pl.title}</span>
                            </DropdownMenuItem>
                        ))}
                    </>
                )}

                <DropdownMenuSeparator />

                {/* Create new playlist */}
                {showCreate ? (
                    <CreatePlaylistForm
                        videoId={videoId}
                        onCreated={() => {
                            setShowCreate(false);
                            setOpen(false);
                        }}
                        onCancel={() => setShowCreate(false)}
                    />
                ) : (
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setShowCreate(true);
                        }}
                        className="gap-2"
                    >
                        <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        Create new playlist
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
