"use client";

import { useState, useTransition } from "react";

import { toast } from "sonner";

import { createPlaylist } from "@/app/playlist/actions";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CreatePlaylistDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: (id: string) => void;
}

export const CreatePlaylistDialog = ({ open, onOpenChange, onCreated }: CreatePlaylistDialogProps) => {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("private");
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        startTransition(async () => {
            const result = await createPlaylist({ title: title.trim(), description, privacy });

            if ("error" in result) {
                toast.error(result.error);
                return;
            }

            toast.success("Playlist created.");
            onOpenChange(false);
            setTitle("");
            setDescription("");
            setPrivacy("private");
            onCreated?.(result.id);
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New playlist</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="pl-title">Title</Label>
                        <Input
                            id="pl-title"
                            placeholder="My playlist"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={200}
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="pl-desc">Description</Label>
                        <Textarea
                            id="pl-desc"
                            placeholder="What is this playlist about?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            maxLength={5000}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="pl-privacy">Privacy</Label>
                        <select
                            id="pl-privacy"
                            value={privacy}
                            onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                            <option value="private">Private &mdash; only you</option>
                            <option value="unlisted">Unlisted &mdash; anyone with the link</option>
                            <option value="public">Public &mdash; everyone</option>
                        </select>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!title.trim() || isPending}>
                            {isPending ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
