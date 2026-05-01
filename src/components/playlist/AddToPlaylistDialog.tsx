"use client";

import { useState } from "react";
import { Check, List, Plus } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/trpc/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddToPlaylistDialogProps {
    videoId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type Privacy = "public" | "unlisted" | "private";

/**
 * Dialog version of the legacy AddToPlaylistButton dropdown. Displayed by the
 * watch page kebab menu; same set of actions (queue, watch later, named
 * playlists, create new). Anonymous viewers see a sign-in prompt.
 */
export const AddToPlaylistDialog = ({ videoId, open, onOpenChange }: AddToPlaylistDialogProps) => {
    const { data: session } = useSession();

    const { data: playlists } = api.playlist.list.useQuery({}, { enabled: !!session?.user && open });

    const utils = api.useUtils();
    const [showCreate, setShowCreate] = useState(false);
    const [queueAdded, setQueueAdded] = useState(false);
    const [watchLaterAdded, setWatchLaterAdded] = useState(false);

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

    const close = () => {
        setShowCreate(false);
        onOpenChange(false);
    };

    if (!session?.user) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Save</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        <a href="/login" className="text-primary underline-offset-4 hover:underline">
                            Sign in
                        </a>{" "}
                        to save videos to a playlist.
                    </p>
                </DialogContent>
            </Dialog>
        );
    }

    const userPlaylists = playlists ?? [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Save to…</DialogTitle>
                </DialogHeader>

                <div className="space-y-1">
                    <PlaylistRow
                        icon={
                            queueAdded ? (
                                <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
                            ) : (
                                <List className="h-4 w-4" aria-hidden="true" />
                            )
                        }
                        label={queueAdded ? "Added to queue" : "Add to queue"}
                        disabled={addToQueue.isPending || queueAdded}
                        onClick={() => addToQueue.mutate({ videoId })}
                    />
                    <PlaylistRow
                        icon={
                            watchLaterAdded ? (
                                <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
                            ) : (
                                <Check className="h-4 w-4" aria-hidden="true" />
                            )
                        }
                        label={watchLaterAdded ? "Saved to Watch Later" : "Add to Watch Later"}
                        disabled={addToWatchLater.isPending || watchLaterAdded}
                        onClick={() => addToWatchLater.mutate({ videoId })}
                    />

                    {userPlaylists.length > 0 && <div className="my-2 border-t border-border" />}

                    {userPlaylists.map((pl) => (
                        <PlaylistRow
                            key={pl.id}
                            icon={null}
                            label={pl.title}
                            disabled={addItem.isPending}
                            onClick={() => {
                                addItem.mutate({ playlistId: pl.id, videoId });
                                close();
                            }}
                        />
                    ))}

                    <div className="my-2 border-t border-border" />

                    {showCreate ? (
                        <CreatePlaylistForm
                            videoId={videoId}
                            onCreated={() => {
                                void utils.playlist.list.invalidate();
                                close();
                            }}
                            onCancel={() => setShowCreate(false)}
                        />
                    ) : (
                        <PlaylistRow
                            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
                            label="Create new playlist"
                            onClick={() => setShowCreate(true)}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const PlaylistRow = ({
    icon,
    label,
    onClick,
    disabled = false,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
        {icon ? <span className="w-4 shrink-0">{icon}</span> : <span className="w-4" />}
        <span className="truncate">{label}</span>
    </button>
);

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

    const createPlaylist = api.playlist.create.useMutation();
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
        <form onSubmit={handleSubmit} className="space-y-2 px-1 py-1">
            <div className="space-y-1">
                <Label htmlFor="dialog-new-playlist-title" className="text-xs">
                    Playlist title
                </Label>
                <Input
                    id="dialog-new-playlist-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My playlist"
                    className="h-8 text-xs"
                    autoFocus
                    maxLength={200}
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="dialog-new-playlist-privacy" className="text-xs">
                    Privacy
                </Label>
                <select
                    id="dialog-new-playlist-privacy"
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as Privacy)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                </select>
            </div>
            <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={busy || !title.trim()}>
                    {busy ? "Creating…" : "Create"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
};
