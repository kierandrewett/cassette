"use client";

import { TimeSlider, useMediaRemote, useMediaState } from "@vidstack/react";
import { Maximize, Minimize, PictureInPicture2, SkipForward, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/lib/player/store";
import type { VideoChapter } from "@/server/db/schema/videos";
import type { VideoVariant } from "@/server/db/schema/videos";
import { CaptionsMenu } from "./CaptionsMenu";
import { SettingsMenu } from "./SettingsMenu";

interface PlayerBottomBarProps {
    videoId: string;
    chapters: VideoChapter[];
    // variants reserved for future quality sub-menu expansion
    variants: VideoVariant[];
    active: boolean;
}

export const PlayerBottomBar = ({ videoId, chapters, variants: _variants, active }: PlayerBottomBarProps) => {
    const remote = useMediaRemote();
    const paused = useMediaState("paused");
    const currentTime = useMediaState("currentTime");
    const duration = useMediaState("duration");
    const muted = useMediaState("muted");
    const volume = useMediaState("volume");
    const fullscreen = useMediaState("fullscreen");
    const canPiP = useMediaState("canPictureInPicture");
    const theatre = usePlayerStore((s) => s.theatre);
    const toggleTheatre = usePlayerStore((s) => s.toggleTheatre);

    const handlePlayPause = () => {
        if (paused) void remote.play();
        else void remote.pause();
    };

    const handleVolumeClick = () => {
        if (muted) remote.unmute();
        else remote.mute();
    };

    const handleFullscreen = () => {
        if (fullscreen) void remote.exitFullscreen();
        else void remote.enterFullscreen();
    };

    const handlePiP = () => {
        if (remote) void remote.enterPictureInPicture();
    };

    return (
        <div
            className="player-bar absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 px-4 pb-4 pt-8"
            data-active={active ? "true" : "false"}
            data-position="bottom"
        >
            {/* Scrubber row */}
            <TimeSlider.Root
                className="group/slider relative flex h-4 w-full cursor-pointer items-center"
                aria-label="Seek"
            >
                <TimeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-all duration-150 group-hover/slider:h-[5px]">
                    <TimeSlider.TrackFill className="absolute inset-y-0 left-0 rounded-full bg-white/95 will-change-[width]" />
                    <TimeSlider.Progress className="absolute inset-y-0 left-0 rounded-full bg-white/45 will-change-[width]" />
                </TimeSlider.Track>

                <TimeSlider.Thumb className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white opacity-0 shadow group-hover/slider:opacity-100 transition-opacity ring-2 ring-white/20 will-change-[left]" />

                <TimeSlider.Preview className="absolute bottom-full mb-3 flex flex-col items-center" noClamp>
                    <TimeSlider.Value className="hidden" />
                    {/* Custom preview content */}
                    <PreviewContent videoId={videoId} chapters={chapters} />
                </TimeSlider.Preview>
            </TimeSlider.Root>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-2">
                {/* Left group */}
                <div className="flex items-center gap-1">
                    {/* Play / Pause */}
                    <IconButton aria-label={paused ? "Play" : "Pause"} onClick={handlePlayPause}>
                        {paused ? <PlayIcon /> : <PauseIcon />}
                    </IconButton>

                    {/* Skip +10s */}
                    <IconButton aria-label="Skip 10 seconds" onClick={() => remote.seek(currentTime + 10)}>
                        <SkipForward className="h-5 w-5" />
                    </IconButton>

                    {/* Volume */}
                    <div className="flex items-center gap-1">
                        <IconButton aria-label={muted ? "Unmute" : "Mute"} onClick={handleVolumeClick}>
                            {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                        </IconButton>
                        {/* Compact volume slider, visible on hover */}
                        <div className="w-0 overflow-hidden transition-all duration-200 group-hover:w-20">
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.02}
                                value={muted ? 0 : volume}
                                onChange={(e) => remote.changeVolume(Number(e.target.value))}
                                className="h-1 w-20 cursor-pointer accent-white"
                                aria-label="Volume"
                            />
                        </div>
                    </div>

                    {/* Time display */}
                    <span className="ml-2 tabular-nums text-sm font-medium text-white/90 select-none">
                        {formatDuration(currentTime)}
                        <span className="mx-1 text-white/40">/</span>
                        {formatDuration(duration)}
                    </span>
                </div>

                {/* Right group */}
                <div className="flex items-center gap-1">
                    <CaptionsMenu />
                    <SettingsMenu />

                    {/* Theatre mode */}
                    <IconButton aria-label={theatre ? "Exit theatre mode" : "Theatre mode"} onClick={toggleTheatre}>
                        {theatre ? <TheatreExitIcon /> : <TheatreIcon />}
                    </IconButton>

                    {/* PiP */}
                    {canPiP && (
                        <IconButton aria-label="Picture in picture" onClick={handlePiP}>
                            <PictureInPicture2 className="h-5 w-5" />
                        </IconButton>
                    )}

                    {/* Fullscreen */}
                    <IconButton aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={handleFullscreen}>
                        {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                    </IconButton>
                </div>
            </div>
        </div>
    );
};

// ---- Sub-components ----

const IconButton = ({
    children,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
        {...props}
        className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-white/80",
            "hover:text-white hover:bg-white/10",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
            "transition-colors",
            className,
        )}
    >
        {children}
    </button>
);

// Preview content rendered inside TimeSlider.Preview
const PreviewContent = ({ videoId, chapters: _chapters }: { videoId: string; chapters: VideoChapter[] }) => {
    // We use the data-slider-value attribute that TimeSlider.Value sets on the parent.
    // Instead of reading this value here (which would require a ref), we let TimeSlider.Preview
    // position us and use a Value element to extract the current preview time.
    return (
        <div className="flex flex-col items-center gap-1">
            {/* The Value is hidden; we render thumbnail + chapter via JS reading data attributes */}
            <TimeSlider.Value
                className="rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white"
                type="pointer"
                format="time"
            />
            <div
                className="surface-glass relative overflow-hidden rounded-lg border border-white/10 shadow-xl"
                style={{ width: 160, height: 90 }}
            >
                <Image
                    src={`/api/hls/${videoId}/thumb/sprite.jpg`}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                />
            </div>
        </div>
    );
};

const PlayIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <polygon points="5,3 19,12 5,21" />
    </svg>
);

const PauseIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
    </svg>
);

const TheatreIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <line x1="8" y1="6" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="18" />
    </svg>
);

const TheatreExitIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <rect x="2" y="6" width="20" height="12" rx="2" opacity={0.2} />
        <rect x="8" y="6" width="8" height="12" rx="1" />
    </svg>
);
