"use client";

import { useMediaRemote, useMediaState, useVideoQualityOptions } from "@vidstack/react";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { readPreferences } from "@/lib/player/preferences";
import { StatsOverlay } from "./StatsOverlay";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const PANEL_INDEX = { root: 0, quality: 1, speed: 2 } as const;
type Panel = keyof typeof PANEL_INDEX;
const PANEL_COUNT = 3;

/**
 * Gear icon opening a popover with Quality / Speed sub-panels.
 *
 * Stats-for-nerds is OWNED by the right-click context menu — never shown
 * here. We still mount StatsOverlay because this component already sits
 * inside PlayerCanvas and a single mount keeps wiring simple.
 *
 * Sub-panel transition: a single horizontal track holds all three panels
 * side-by-side and translates by `panelIdx * (100 / N)%`. This is the
 * Stripe / Amazon-mega-menu pattern — the panels share the same surface
 * and slide as one unit, rather than fading + remounting per state change.
 */
export const SettingsMenu = () => {
    const [open, setOpen] = useState(false);
    const [panel, setPanel] = useState<Panel>("root");
    const remote = useMediaRemote();
    const playbackRate = useMediaState("playbackRate");
    const quality = useMediaState("quality");
    const autoQuality = useMediaState("autoQuality");
    const qualities = useVideoQualityOptions();

    // Stats overlay state mirrors the right-click context menu's toggle.
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

    useEffect(() => {
        const onLeave = () => handleClose();
        window.addEventListener("cassette:player-leave", onLeave);
        return () => window.removeEventListener("cassette:player-leave", onLeave);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                handleClose();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    const panelIdx = PANEL_INDEX[panel];

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
                            {/* Sliding track. Three panels share the same
                                surface; the wrapper is N times the popover
                                width and translates by panelIdx * (100/N)%
                                so the active panel sits in view. cubic-bezier
                                matches the shadcn ease curve. */}
                            <div
                                className={cn(
                                    "flex motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.4,0,0.2,1)]",
                                )}
                                style={{
                                    width: `${PANEL_COUNT * 100}%`,
                                    transform: `translateX(-${(panelIdx * 100) / PANEL_COUNT}%)`,
                                }}
                            >
                                <div className="shrink-0 py-2" style={{ width: `${100 / PANEL_COUNT}%` }}>
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

                                <div className="shrink-0 py-2" style={{ width: `${100 / PANEL_COUNT}%` }}>
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

                                <div className="shrink-0 py-2" style={{ width: `${100 / PANEL_COUNT}%` }}>
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
                            </div>
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
