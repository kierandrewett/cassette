"use client";

import { useMediaRemote, useMediaState, useVideoQualityOptions } from "@vidstack/react";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { readPreferences } from "@/lib/player/preferences";
import { StatsOverlay } from "./StatsOverlay";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Gear icon opening a popover with Quality / Speed sub-panels.
 *
 * Stats-for-nerds lives in the right-click context menu (PlayerContextMenu)
 * — we don't surface it here. The mini-stats summary that used to sit
 * below the menu has been dropped too: power users go to the context menu;
 * casual viewers don't need quality+buffer numbers in their face.
 *
 * Sub-panel transition: the active panel re-mounts under the same `panel`
 * key so the animate-in/slide-in-from-right utilities give it a YouTube-
 * like slide on every transition.
 */
export const SettingsMenu = () => {
    const [open, setOpen] = useState(false);
    const [panel, setPanel] = useState<"root" | "quality" | "speed">("root");
    const remote = useMediaRemote();
    const playbackRate = useMediaState("playbackRate");
    const quality = useMediaState("quality");
    const autoQuality = useMediaState("autoQuality");
    const qualities = useVideoQualityOptions();

    // Stats overlay state lives in localStorage; the gear menu no longer
    // toggles it — the context menu does. We still mount the overlay here
    // because this component already sits inside PlayerCanvas and a single
    // mount keeps wiring simple.
    const [statsEnabled, setStatsEnabled] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return readPreferences().statsOverlayEnabled;
    });
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
            setStatsEnabled(detail.enabled);
        };
        window.addEventListener("cassette:stats-toggle", handler);
        return () => window.removeEventListener("cassette:stats-toggle", handler);
    }, []);

    const handleClose = () => {
        setOpen(false);
        setPanel("root");
    };

    // Auto-close when the pointer leaves the player surface so the panel
    // doesn't stick around when the user moves on.
    useEffect(() => {
        const onLeave = () => handleClose();
        window.addEventListener("cassette:player-leave", onLeave);
        return () => window.removeEventListener("cassette:player-leave", onLeave);
    }, []);

    return (
        <>
            <StatsOverlay visible={statsEnabled} />

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
                        "text-white/80 hover:bg-white/10 hover:text-white",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                        "transition-colors",
                        open && "bg-white/10 text-white",
                    )}
                >
                    <Settings size={20} strokeWidth={2.25} />
                </button>

                {open && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={handleClose} />

                        <div
                            className="player-popover absolute bottom-full right-0 z-50 mb-2 w-56 overflow-hidden rounded-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {panel === "root" && (
                                <div
                                    key="root"
                                    className="py-2 duration-200 animate-in fade-in slide-in-from-left-4"
                                >
                                    <MenuRow
                                        label="Quality"
                                        value={autoQuality ? "Auto" : quality?.height ? `${quality.height}p` : "Auto"}
                                        onClick={() => setPanel("quality")}
                                    />
                                    <MenuRow
                                        label="Speed"
                                        value={playbackRate === 1 ? "Normal" : `${playbackRate}x`}
                                        onClick={() => setPanel("speed")}
                                    />
                                </div>
                            )}

                            {panel === "quality" && (
                                <div
                                    key="quality"
                                    className="py-2 duration-200 animate-in fade-in slide-in-from-right-4"
                                >
                                    <PanelHeader label="Quality" onBack={() => setPanel("root")} />
                                    <button
                                        className={cn(
                                            "flex w-full items-center justify-between px-4 py-2 text-sm",
                                            "transition-colors hover:bg-white/10",
                                            autoQuality ? "font-medium text-white" : "text-white/70",
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
                                                "transition-colors hover:bg-white/10",
                                                !autoQuality && quality?.height === parseInt(q.label)
                                                    ? "font-medium text-white"
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
                                <div
                                    key="speed"
                                    className="py-2 duration-200 animate-in fade-in slide-in-from-right-4"
                                >
                                    <PanelHeader label="Playback Speed" onBack={() => setPanel("root")} />
                                    {SPEEDS.map((s) => (
                                        <button
                                            key={s}
                                            className={cn(
                                                "flex w-full items-center justify-between px-4 py-2 text-sm",
                                                "transition-colors hover:bg-white/10",
                                                playbackRate === s ? "font-medium text-white" : "text-white/70",
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
        </>
    );
};

const MenuRow = ({ label, value, onClick }: { label: string; value: string; onClick: () => void }) => (
    <button
        className="flex w-full items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-white/10"
        onClick={onClick}
    >
        <span className="text-white/70">{label}</span>
        <span className="flex items-center gap-1 font-medium text-white/90">
            {value}
            <ChevronRight />
        </span>
    </button>
);

const PanelHeader = ({ label, onBack }: { label: string; onBack: () => void }) => (
    <div className="flex items-center gap-2 px-4 pb-2">
        <button
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Back"
        >
            <ChevronLeft />
        </button>
        <span className="text-sm font-medium text-white">{label}</span>
    </div>
);

const QuickStats = ({
    bufferedEnd,
    duration,
    quality,
}: {
    bufferedEnd: number;
    duration: number;
    quality: { height?: number } | null;
}) => (
    <div className="px-4 py-2">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-white/50">Stats for nerds</p>
        <div className="space-y-1 text-xs text-white/60">
            <div className="flex justify-between">
                <span>Quality</span>
                <span>{quality?.height ? `${quality.height}p` : "auto"}</span>
            </div>
            <div className="flex justify-between">
                <span>Buffered</span>
                <span>
                    {Math.round(bufferedEnd)}s / {Math.round(duration)}s
                </span>
            </div>
        </div>
    </div>
);

const ToggleIndicator = ({ on }: { on: boolean }) => (
    <span
        className={cn(
            "inline-flex h-4 w-7 items-center rounded-full transition-colors",
            on ? "bg-white/80" : "bg-white/20",
        )}
    >
        <span className={cn("ml-0.5 h-3 w-3 rounded-full bg-black transition-transform", on && "translate-x-3")} />
    </span>
);

const Check = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
            d="M2 7l3.5 3.5L12 3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
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
