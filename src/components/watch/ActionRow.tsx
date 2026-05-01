"use client";

import { useState } from "react";
import { MoreVerticalIcon, Note01Icon, Playlist01Icon, Share01Icon } from "hugeicons-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddToWatchLaterChip } from "@/components/social/AddToWatchLaterChip";
import { AddToPlaylistDialog } from "@/components/playlist/AddToPlaylistDialog";
import { ShareDialog } from "@/components/watch/ShareDialog";
import { TranscriptToggleButton } from "@/components/watch/TranscriptToggleButton";
import { cn, formatCount } from "@/lib/utils";

interface CaptionTrack {
    lang: string;
    label: string;
    isDefault: boolean;
}

interface ActionRowProps {
    videoId: string;
    /** Public URL slug or unlisted secret — appended to share URLs as ?slug=. */
    slug?: string | null;
    isPrivate?: boolean;
    likeCount: number;
    dislikeCount?: number;
    isLikedByMe: "like" | "dislike" | null;
    captions: CaptionTrack[];
    signedToken?: string | null;
}

/**
 * Compact action row above the description card.
 *
 * Layout: [Like | Dislike] [Watch Later] [… kebab — Share, Transcript, Add to playlist]
 *
 * Share + Transcript moved to the kebab to declutter the row. Watch Later
 * stays inline because it is a one-tap toggle (different system list from
 * the user's named playlists). The "Add to playlist" entry opens a dialog
 * that the prior + button used to expose.
 */
export const ActionRow = ({
    videoId,
    slug,
    isPrivate = false,
    likeCount,
    dislikeCount: _dislikeCount = 0,
    isLikedByMe,
    captions,
    signedToken,
}: ActionRowProps) => {
    const [shareOpen, setShareOpen] = useState(false);
    const [transcriptOpen, setTranscriptOpen] = useState(false);
    const [playlistOpen, setPlaylistOpen] = useState(false);

    const transcriptDisabled = captions.length === 0;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Like / Dislike — pill group */}
            <div className="flex items-center overflow-hidden rounded-full bg-secondary/60 transition-colors hover:bg-secondary/80">
                <ActionPillButton
                    aria-label={isLikedByMe === "like" ? "Unlike" : "Like"}
                    aria-pressed={isLikedByMe === "like"}
                >
                    <ThumbUpIcon active={isLikedByMe === "like"} />
                    <span>{formatCount(likeCount)}</span>
                </ActionPillButton>
                <span className="h-5 w-px bg-border/60" aria-hidden="true" />
                <ActionPillButton
                    aria-label={isLikedByMe === "dislike" ? "Remove dislike" : "Dislike"}
                    aria-pressed={isLikedByMe === "dislike"}
                >
                    <ThumbDownIcon active={isLikedByMe === "dislike"} />
                </ActionPillButton>
            </div>

            <AddToWatchLaterChip videoId={videoId} />

            {/* Overflow menu — Share / Transcript / Add to playlist. */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="More actions"
                        className={cn(
                            "inline-flex h-9 w-9 items-center justify-center rounded-full",
                            "bg-secondary/60 text-foreground/80 transition-colors",
                            "hover:bg-secondary/80 hover:text-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                    >
                        <MoreVerticalIcon size={18} aria-hidden="true" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setShareOpen(true);
                        }}
                    >
                        <Share01Icon className="mr-2 h-4 w-4" aria-hidden="true" />
                        Share
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={transcriptDisabled}
                        onSelect={(e) => {
                            e.preventDefault();
                            if (!transcriptDisabled) setTranscriptOpen(true);
                        }}
                    >
                        <Note01Icon className="mr-2 h-4 w-4" aria-hidden="true" />
                        Transcript
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setPlaylistOpen(true);
                        }}
                    >
                        <Playlist01Icon className="mr-2 h-4 w-4" aria-hidden="true" />
                        Add to playlist…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Modals — controlled externally so DropdownMenu close doesn't dismiss them. */}
            <ShareDialog
                videoId={videoId}
                slug={slug}
                isPrivate={isPrivate}
                open={shareOpen}
                onOpenChange={setShareOpen}
            />
            <TranscriptToggleButton
                videoId={videoId}
                captions={captions}
                signedToken={signedToken}
                open={transcriptOpen}
                onOpenChange={setTranscriptOpen}
                renderTrigger={false}
            />
            <AddToPlaylistDialog videoId={videoId} open={playlistOpen} onOpenChange={setPlaylistOpen} />
        </div>
    );
};

// ---- Local presentational primitives ----

const ActionPillButton = ({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
        type="button"
        {...props}
        className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground/80",
            "transition-colors hover:bg-white/5 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
        )}
    >
        {children}
    </button>
);

const ThumbUpIcon = ({ active }: { active: boolean }) => (
    <svg
        viewBox="0 0 24 24"
        className={cn("h-4 w-4", active ? "fill-foreground" : "fill-none stroke-current")}
        strokeWidth={1.8}
        aria-hidden="true"
    >
        <path d="M7 22V11L12 2l.85.35q.425.175.725.625t.3 1.025L12.65 9H19q.8 0 1.4.6t.6 1.4v2q0 .2-.05.45t-.1.45l-3 7.05q-.25.55-.85.925T15.7 22H7zm0-2h8.7l3-7v-2h-8.15l1.35-6.45L7 9.5V20zm-2 0V11H2v9h3z" />
    </svg>
);

const ThumbDownIcon = ({ active }: { active: boolean }) => (
    <svg
        viewBox="0 0 24 24"
        className={cn("h-4 w-4 scale-y-[-1]", active ? "fill-foreground" : "fill-none stroke-current")}
        strokeWidth={1.8}
        aria-hidden="true"
    >
        <path d="M7 22V11L12 2l.85.35q.425.175.725.625t.3 1.025L12.65 9H19q.8 0 1.4.6t.6 1.4v2q0 .2-.05.45t-.1.45l-3 7.05q-.25.55-.85.925T15.7 22H7zm0-2h8.7l3-7v-2h-8.15l1.35-6.45L7 9.5V20zm-2 0V11H2v9h3z" />
    </svg>
);
