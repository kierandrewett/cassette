"use client";

import { TimeSlider, VolumeSlider, useMediaRemote, useMediaState } from "@vidstack/react";
import {
    Backward01Icon,
    Forward01Icon,
    LayoutBottomIcon,
    MaximizeScreenIcon,
    MinimizeScreenIcon,
    PauseIcon,
    PictureInPictureOnIcon,
    PlayIcon,
    VolumeHighIcon,
    VolumeMute01Icon,
} from "hugeicons-react";
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/lib/player/store";
import { readPreferences } from "@/lib/player/preferences";
import type { VideoChapter } from "@/server/db/schema/videos";
import type { VideoVariant } from "@/server/db/schema/videos";
import { CaptionsMenu } from "./CaptionsMenu";
import { SettingsMenu } from "./SettingsMenu";
import { SleepTimer, SleepTimerChip, type SleepTimerState } from "./SleepTimer";

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

    // Hover state for the seek-bar preview tile.  We render the preview
    // unconditionally (Vidstack positions it via TimeSlider.Preview), then
    // gate visibility on this flag so the tile vanishes the instant the
    // pointer leaves the rail.  Without this, Vidstack leaves the preview
    // mounted at its last position and it lingers on screen.
    const [previewVisible, setPreviewVisible] = useState(false);

    // Sleep timer state for the chip overlay.
    const [sleepState, setSleepState] = useState<SleepTimerState>({
        option: typeof window !== "undefined" ? readPreferences().lastSleepTimer : "off",
        remainingSec: null,
    });

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

    const isMuted = muted || volume === 0;

    return (
        <>
            {/* Sleep timer chip — bottom-right of the player canvas. */}
            <SleepTimerChip option={sleepState.option} remainingSec={sleepState.remainingSec} />

            <div
                className="player-bar absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 px-4 pb-4 pt-8"
                data-active={active ? "true" : "false"}
                data-position="bottom"
            >
                {/* Scrubber row */}
                <TimeSlider.Root
                    className="group/slider relative flex h-4 w-full cursor-pointer items-center"
                    aria-label="Seek"
                    onPointerEnter={() => setPreviewVisible(true)}
                    onPointerLeave={() => setPreviewVisible(false)}
                >
                    <TimeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-all duration-150 group-hover/slider:h-[5px]">
                        <TimeSlider.TrackFill className="absolute inset-y-0 left-0 rounded-full bg-white/95 will-change-[width]" />
                        <TimeSlider.Progress className="absolute inset-y-0 left-0 rounded-full bg-white/45 will-change-[width]" />
                    </TimeSlider.Track>

                    {/* Visible playhead — small white dot that grows on hover/drag.
                    Vidstack writes the current value as a CSS var on the root,
                    so we position via inline style.  TimeSlider.Thumb already
                    sets data-active during scrubs. */}
                    <TimeSlider.Thumb className="player-thumb" />

                    <TimeSlider.Preview
                        className="pointer-events-none absolute bottom-full mb-3 flex flex-col items-center transition-opacity duration-150"
                        style={{ opacity: previewVisible ? 1 : 0 }}
                        noClamp
                    >
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
                            {paused ? <PlayIcon size={20} /> : <PauseIcon size={20} />}
                        </IconButton>

                        {/* Skip -10s */}
                        <IconButton aria-label="Rewind 10 seconds" onClick={() => remote.seek(currentTime - 10)}>
                            <Backward01Icon size={20} />
                        </IconButton>

                        {/* Skip +10s */}
                        <IconButton aria-label="Skip 10 seconds" onClick={() => remote.seek(currentTime + 10)}>
                            <Forward01Icon size={20} />
                        </IconButton>

                        {/* Volume — button with horizontal slider that reveals on hover/focus */}
                        <div className="volume-stack">
                            <IconButton aria-label={isMuted ? "Unmute" : "Mute"} onClick={handleVolumeClick}>
                                {isMuted ? <VolumeMute01Icon size={20} /> : <VolumeHighIcon size={20} />}
                            </IconButton>
                            <div className="volume-rail">
                                <VolumeSlider.Root
                                    aria-label="Volume"
                                    className="group/vol relative flex h-4 w-[88px] cursor-pointer items-center px-1"
                                >
                                    <VolumeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/20">
                                        <VolumeSlider.TrackFill className="absolute inset-y-0 left-0 rounded-full bg-white/95 will-change-[width]" />
                                    </VolumeSlider.Track>
                                    <VolumeSlider.Thumb className="player-thumb" />
                                </VolumeSlider.Root>
                            </div>
                        </div>

                        {/* Time display */}
                        <span className="ml-2 select-none text-sm font-medium tabular-nums text-white/90">
                            {formatDuration(currentTime)}
                            <span className="mx-1 text-white/40">/</span>
                            {formatDuration(duration)}
                        </span>
                    </div>

                    {/* Right group */}
                    <div className="flex items-center gap-1">
                        <CaptionsMenu />
                        <SleepTimer onStateChange={setSleepState} />
                        <SettingsMenu />

                        {/* Theatre mode */}
                        <IconButton aria-label={theatre ? "Exit theatre mode" : "Theatre mode"} onClick={toggleTheatre}>
                            <LayoutBottomIcon size={20} />
                        </IconButton>

                        {/* PiP */}
                        {canPiP && (
                            <IconButton aria-label="Picture in picture" onClick={handlePiP}>
                                <PictureInPictureOnIcon size={20} />
                            </IconButton>
                        )}

                        {/* Fullscreen */}
                        <IconButton
                            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                            onClick={handleFullscreen}
                        >
                            {fullscreen ? <MinimizeScreenIcon size={20} /> : <MaximizeScreenIcon size={20} />}
                        </IconButton>
                    </div>
                </div>
            </div>
        </>
    );
};

// ---- Sub-components ----

const IconButton = ({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button
        {...props}
        className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-white/80",
            "hover:bg-white/10 hover:text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
            "transition-colors",
            className,
        )}
    >
        {children}
    </button>
);

// Preview content rendered inside TimeSlider.Preview.
// The thumbnail itself is sourced from the sprite; chapter title (if any)
// is supplied via TimeSlider.ChapterTitle.  We let Vidstack drive position.
const PreviewContent = ({ videoId, chapters: _chapters }: { videoId: string; chapters: VideoChapter[] }) => (
    <div className="flex flex-col items-center gap-1">
        <TimeSlider.Value
            className="rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white"
            type="pointer"
            format="time"
        />
        <div className="player-popover relative overflow-hidden rounded-lg" style={{ width: 160, height: 90 }}>
            <Image src={`/api/hls/${videoId}/thumb/sprite.jpg`} alt="" fill unoptimized className="object-cover" />
        </div>
    </div>
);
