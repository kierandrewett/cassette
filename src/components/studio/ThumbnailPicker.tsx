"use client";

import { useState } from "react";

import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants — must match sprite.ts (10×10 grid, 160×90 tiles)
// ---------------------------------------------------------------------------

const COLS = 10;
const ROWS = 10;
const TILE_W = 160;
const TILE_H = 90; // 16:9 of 160px

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ThumbnailPickerProps = {
    videoId: string;
    /** Called after a successful save so the parent can refresh if needed. */
    onSaved?: (thumbnailPath: string) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ThumbnailPicker = ({ videoId, onSaved }: ThumbnailPickerProps) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [savedIndex, setSavedIndex] = useState<number | null>(null);

    const setThumbnail = api.video.setThumbnailFromSprite.useMutation({
        onSuccess: (data) => {
            setSavedIndex(selectedIndex);
            toast.success("Thumbnail saved.");
            onSaved?.(data.thumbnailPath);
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to save thumbnail.");
        },
    });

    const spriteUrl = `/api/hls/${videoId}/thumb/sprite.jpg`;

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Click a frame to set it as the video thumbnail.</p>

            {/* Sprite grid — rendered by clipping the sprite image at each cell position */}
            <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight: 400 }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${COLS}, ${TILE_W}px)`,
                        width: COLS * TILE_W,
                    }}
                >
                    {Array.from({ length: COLS * ROWS }, (_, i) => {
                        const col = i % COLS;
                        const row = Math.floor(i / COLS);
                        const x = col * TILE_W;
                        const y = row * TILE_H;
                        const isSelected = selectedIndex === i;
                        const isSaved = savedIndex === i;

                        return (
                            <button
                                key={i}
                                type="button"
                                title={`Frame ${i + 1}`}
                                onClick={() => {
                                    setSelectedIndex(i);
                                    setThumbnail.mutate({ videoId, frameIndex: i });
                                }}
                                disabled={setThumbnail.isPending}
                                className={cn(
                                    "relative overflow-hidden border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    isSelected ? "border-primary" : "border-transparent hover:border-primary/50",
                                    setThumbnail.isPending && "pointer-events-none opacity-70",
                                )}
                                style={{
                                    width: TILE_W,
                                    height: TILE_H,
                                    backgroundImage: `url(${spriteUrl})`,
                                    backgroundPosition: `-${x}px -${y}px`,
                                    backgroundRepeat: "no-repeat",
                                    backgroundSize: `${COLS * TILE_W}px ${ROWS * TILE_H}px`,
                                }}
                            >
                                {/* Saved tick overlay */}
                                {isSaved && !setThumbnail.isPending && (
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="white"
                                            strokeWidth={2.5}
                                            className="h-6 w-6"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M4.5 12.75l6 6 9-13.5"
                                            />
                                        </svg>
                                    </span>
                                )}

                                {/* Loading spinner on the selected cell */}
                                {isSelected && setThumbnail.isPending && (
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                        <svg
                                            className="h-5 w-5 animate-spin text-white"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            />
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8v8H4z"
                                            />
                                        </svg>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {savedIndex !== null && !setThumbnail.isPending && (
                <p className="text-xs text-green-400">Frame {savedIndex + 1} set as thumbnail.</p>
            )}
        </div>
    );
};
