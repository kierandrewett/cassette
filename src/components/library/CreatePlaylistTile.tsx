"use client";

import { useState } from "react";

import { Plus } from "lucide-react";

import { CreatePlaylistDialog } from "./CreatePlaylistDialog";

interface CreatePlaylistTileProps {
    onCreated?: (id: string) => void;
}

// Dashed-border tile that opens the create playlist dialog when clicked.
export const CreatePlaylistTile = ({ onCreated }: CreatePlaylistTileProps) => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex h-40 w-36 flex-shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="New playlist"
            >
                <Plus className="h-8 w-8" />
                <span className="text-xs font-medium">New playlist</span>
            </button>

            <CreatePlaylistDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
        </>
    );
};
