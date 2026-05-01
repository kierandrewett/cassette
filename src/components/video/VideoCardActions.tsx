"use client";

// Client wrapper so the server-rendered VideoCard can compose with the
// AddToPlaylistButton without becoming a client component itself.
// Rendered as an absolutely-positioned overlay in the thumbnail corner.

import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";

interface VideoCardActionsProps {
    videoId: string;
}

export const VideoCardActions = ({ videoId }: VideoCardActionsProps) => (
    // Only visible on hover of the parent .group — group-hover:opacity-100.
    <div
        className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        // Prevent the Link wrapping VideoCard from navigating when the user
        // interacts with the actions overlay.
        onClick={(e) => e.preventDefault()}
    >
        <AddToPlaylistButton videoId={videoId} />
    </div>
);
