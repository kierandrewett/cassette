"use client";

import Image from "next/image";

import type { VideoChapter } from "@/server/db/schema/videos";
import { formatDuration } from "@/lib/utils";

interface ScrubberPreviewProps {
    videoId: string;
    // chapters reserved for chapter title display once slider value is accessible
    chapters: VideoChapter[];
}

/**
 * Floating scrubber preview showing a sprite thumbnail and chapter title.
 * Positioned at the pointer's X coordinate above the scrubber rail.
 *
 * Sprite frames are provided via a WebVTT track with kind="metadata".
 */
export const ScrubberPreview = ({ videoId, chapters: _chapters }: ScrubberPreviewProps) => {
    // useSliderPreview gives us the pointer position and value from the TimeSlider
    // We need the root time slider element; it's provided by SliderPreview inside TimeSlider.
    // This component is rendered inside SliderPreview from PlayerBottomBar.
    // We rely on the "pointerValue" prop being passed from the parent.
    return (
        <div
            className="pointer-events-none absolute bottom-full mb-4 flex flex-col items-center gap-1"
            style={{ transform: "translateX(-50%)" }}
        >
            {/* Thumbnail placeholder — if sprite VTT is not yet loaded, shows a blank */}
            <ThumbnailFrame videoId={videoId} />
            {/* Time label */}
            <span className="text-xs font-medium tabular-nums text-white drop-shadow">{formatDuration(0)}</span>
        </div>
    );
};

const ThumbnailFrame = ({ videoId }: { videoId: string }) => (
    <div
        className="surface-glass relative overflow-hidden rounded-lg border border-white/10 shadow-xl"
        style={{ width: 160, height: 90 }}
    >
        <Image src={`/api/hls/${videoId}/thumb/sprite.jpg`} alt="" fill unoptimized className="object-cover" />
    </div>
);

/**
 * Inner preview content rendered inside Vidstack's SliderPreview.
 * Receives the preview time and looks up the chapter title.
 */
export const ScrubberPreviewInner = ({
    videoId,
    previewTime,
    chapters,
}: {
    videoId: string;
    previewTime: number;
    chapters: VideoChapter[];
}) => {
    // Find chapter title for this preview time.
    const chapter = [...chapters].reverse().find((ch) => previewTime >= ch.startSec);

    return (
        <div className="pointer-events-none flex flex-col items-center gap-1">
            {chapter && (
                <span className="max-w-[180px] truncate rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                    {chapter.title}
                </span>
            )}
            <div
                className="surface-glass relative overflow-hidden rounded-lg border border-white/10 shadow-xl"
                style={{ width: 160, height: 90 }}
            >
                <Image src={`/api/hls/${videoId}/thumb/sprite.jpg`} alt="" fill unoptimized className="object-cover" />
            </div>
            <span className="text-xs font-medium tabular-nums text-white drop-shadow">
                {formatDuration(previewTime)}
            </span>
        </div>
    );
};
