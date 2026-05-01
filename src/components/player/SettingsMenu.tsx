"use client";

import { useMediaRemote, useMediaState, useVideoQualityOptions } from "@vidstack/react";
import { Settings } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Gear icon opening a popover with Quality / Speed / Stats submenus.
 * Uses a custom popover (not Vidstack's Menu) to keep full style control.
 */
export const SettingsMenu = () => {
    const [open, setOpen] = useState(false);
    const [panel, setPanel] = useState<"root" | "quality" | "speed">("root");
    const remote = useMediaRemote();
    const playbackRate = useMediaState("playbackRate");
    const quality = useMediaState("quality");
    const autoQuality = useMediaState("autoQuality");
    const bufferedEnd = useMediaState("bufferedEnd");
    const duration = useMediaState("duration");
    const qualities = useVideoQualityOptions();

    const handleClose = () => {
        setOpen(false);
        setPanel("root");
    };

    return (
        <div className="relative">
            <button
                aria-label="Settings"
                aria-expanded={open}
                onClick={() => {
                    setOpen((v) => !v);
                    setPanel("root");
                }}
                className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full",
                    "text-white/80 hover:text-white hover:bg-white/10",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                    "transition-colors",
                    open && "bg-white/10 text-white",
                )}
            >
                <Settings className="h-5 w-5" />
            </button>

            {open && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={handleClose} />

                    {/* Panel */}
                    <div
                        className="absolute bottom-full right-0 mb-2 z-50 w-56 overflow-hidden rounded-xl surface-glass shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {panel === "root" && (
                            <div className="py-2">
                                <MenuRow
                                    label="Quality"
                                    value={autoQuality ? "Auto" : (quality?.height ? `${quality.height}p` : "Auto")}
                                    onClick={() => setPanel("quality")}
                                />
                                <MenuRow
                                    label="Speed"
                                    value={playbackRate === 1 ? "Normal" : `${playbackRate}x`}
                                    onClick={() => setPanel("speed")}
                                />
                                <div className="mx-3 my-1 border-t border-white/10" />
                                <StatsPanel bufferedEnd={bufferedEnd} duration={duration} quality={quality} />
                            </div>
                        )}

                        {panel === "quality" && (
                            <div className="py-2">
                                <PanelHeader label="Quality" onBack={() => setPanel("root")} />
                                <button
                                    className={cn(
                                        "flex w-full items-center justify-between px-4 py-2 text-sm",
                                        "hover:bg-white/10 transition-colors",
                                        autoQuality ? "text-white font-medium" : "text-white/70",
                                    )}
                                    onClick={() => {
                                        remote.changeQuality(-1);
                                        handleClose();
                                    }}
                                >
                                    <span>Auto</span>
                                    {autoQuality && <Check />}
                                </button>
                                {qualities.map((q) => (
                                    <button
                                        key={q.value}
                                        className={cn(
                                            "flex w-full items-center justify-between px-4 py-2 text-sm",
                                            "hover:bg-white/10 transition-colors",
                                            !autoQuality && quality?.height === parseInt(q.label)
                                                ? "text-white font-medium"
                                                : "text-white/70",
                                        )}
                                        onClick={() => {
                                            q.select();
                                            handleClose();
                                        }}
                                    >
                                        <span>{q.label}</span>
                                        {!autoQuality && quality?.height === parseInt(q.label) && <Check />}
                                    </button>
                                ))}
                            </div>
                        )}

                        {panel === "speed" && (
                            <div className="py-2">
                                <PanelHeader label="Playback Speed" onBack={() => setPanel("root")} />
                                {SPEEDS.map((s) => (
                                    <button
                                        key={s}
                                        className={cn(
                                            "flex w-full items-center justify-between px-4 py-2 text-sm",
                                            "hover:bg-white/10 transition-colors",
                                            playbackRate === s ? "text-white font-medium" : "text-white/70",
                                        )}
                                        onClick={() => {
                                            remote.changePlaybackRate(s);
                                            handleClose();
                                        }}
                                    >
                                        <span>{s === 1 ? "Normal" : `${s}x`}</span>
                                        {playbackRate === s && <Check />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const MenuRow = ({ label, value, onClick }: { label: string; value: string; onClick: () => void }) => (
    <button
        className="flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-white/10 transition-colors"
        onClick={onClick}
    >
        <span className="text-white/70">{label}</span>
        <span className="flex items-center gap-1 text-white/90 font-medium">
            {value}
            <ChevronRight />
        </span>
    </button>
);

const PanelHeader = ({ label, onBack }: { label: string; onBack: () => void }) => (
    <div className="flex items-center gap-2 px-4 pb-2">
        <button
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            aria-label="Back"
        >
            <ChevronLeft />
        </button>
        <span className="text-sm font-medium text-white">{label}</span>
    </div>
);

const StatsPanel = ({
    bufferedEnd,
    duration,
    quality,
}: {
    bufferedEnd: number;
    duration: number;
    quality: { height?: number } | null;
}) => (
    <div className="px-4 py-2">
        <p className="mb-1 text-xs font-medium text-white/50 uppercase tracking-wider">Stats for nerds</p>
        <div className="space-y-1 text-xs text-white/60">
            <div className="flex justify-between">
                <span>Quality</span>
                <span>{quality?.height ? `${quality.height}p` : "auto"}</span>
            </div>
            <div className="flex justify-between">
                <span>Buffered</span>
                <span>{Math.round(bufferedEnd)}s / {Math.round(duration)}s</span>
            </div>
        </div>
    </div>
);

const Check = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ChevronRight = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 10l4-3-4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ChevronLeft = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M9 10L5 7l4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
