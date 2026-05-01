"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaRemote, useMediaState } from "@vidstack/react";
import { toast } from "sonner";
import { Moon } from "lucide-react";

import { cn } from "@/lib/utils";
import { readPreferences, writeLastSleepTimer, type SleepTimerOption } from "@/lib/player/preferences";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SleepTimerOption_ {
    value: SleepTimerOption;
    label: string;
}

const OPTIONS: SleepTimerOption_[] = [
    { value: "off", label: "Off" },
    { value: "5", label: "5 minutes" },
    { value: "15", label: "15 minutes" },
    { value: "30", label: "30 minutes" },
    { value: "60", label: "60 minutes" },
    { value: "end", label: "End of video" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatRemaining = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Hook — exposes timer state to siblings (e.g. the remaining chip)
// ---------------------------------------------------------------------------

export interface SleepTimerState {
    option: SleepTimerOption;
    remainingSec: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SleepTimerProps {
    /** Called when the selected option changes so SettingsMenu can close. */
    onSelect?: () => void;
    /** Render prop / callback: informs parent of live state for the chip. */
    onStateChange?: (state: SleepTimerState) => void;
}

export const SleepTimer = ({ onSelect, onStateChange }: SleepTimerProps) => {
    const remote = useMediaRemote();
    const ended = useMediaState("ended");
    const duration = useMediaState("duration");

    const [open, setOpen] = useState(false);
    const [option, setOption] = useState<SleepTimerOption>(() => {
        if (typeof window === "undefined") return "off";
        return readPreferences().lastSleepTimer;
    });
    const [remainingSec, setRemainingSec] = useState<number | null>(null);

    // Auto-close when the pointer leaves the player canvas.
    useEffect(() => {
        const onLeave = () => setOpen(false);
        window.addEventListener("cassette:player-leave", onLeave);
        return () => window.removeEventListener("cassette:player-leave", onLeave);
    }, []);

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const remainingRef = useRef<number | null>(null);

    // Notify parent of state changes.
    useEffect(() => {
        onStateChange?.({ option, remainingSec });
    }, [option, remainingSec, onStateChange]);

    // Clear all timers helper.
    const clearAll = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (tickRef.current) clearInterval(tickRef.current);
        timerRef.current = null;
        tickRef.current = null;
        remainingRef.current = null;
        setRemainingSec(null);
    };

    // Arm / re-arm whenever option changes.
    useEffect(() => {
        clearAll();

        if (option === "off") return;

        if (option === "end") {
            // Will pause when `ended` fires — see below.
            return;
        }

        const minutes = Number(option);
        const totalSec = minutes * 60;
        remainingRef.current = totalSec;
        setRemainingSec(totalSec);

        // Live countdown.
        tickRef.current = setInterval(() => {
            const next = (remainingRef.current ?? 1) - 1;
            remainingRef.current = next;
            setRemainingSec(next);
        }, 1000);

        // Pause at zero.
        timerRef.current = setTimeout(() => {
            clearAll();
            void remote.pause();
            toast("Sleep timer paused playback.", { duration: 5000 });
            setOption("off");
            writeLastSleepTimer("off");
        }, totalSec * 1000);

        return clearAll;
    }, [option]); // eslint-disable-line react-hooks/exhaustive-deps

    // "End of video" — listen for ended.
    useEffect(() => {
        if (option !== "end") return;
        if (!ended) return;
        // Player already stopped; just surface the toast and reset.
        toast("Sleep timer paused playback.", { duration: 5000 });
        setOption("off");
        writeLastSleepTimer("off");
    }, [ended, option]);

    // Keep duration-based display in sync (not strictly needed but defensive).
    const _ = duration;

    const handleSelect = (val: SleepTimerOption) => {
        setOption(val);
        writeLastSleepTimer(val);
        setOpen(false);
        onSelect?.();
    };

    return (
        <div className="relative">
            <button
                aria-label="Sleep timer"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full",
                    "text-white/80 hover:bg-white/10 hover:text-white",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                    "transition-colors",
                    option !== "off" && "bg-white/10 text-white",
                )}
            >
                <Moon
                    size={20}
                    strokeWidth={2.25}
                    fill={option !== "off" ? "currentColor" : "none"}
                    fillOpacity={option !== "off" ? 0.2 : 0}
                />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div
                        className="player-popover absolute bottom-full right-0 z-50 mb-2 w-44 overflow-hidden rounded-xl py-2"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="px-4 pb-1 pt-0.5 text-xs font-medium uppercase tracking-wider text-white/50">
                            Sleep timer
                        </p>
                        {OPTIONS.map((o) => (
                            <button
                                key={o.value}
                                className={cn(
                                    "flex w-full items-center justify-between px-4 py-2 text-sm",
                                    "transition-colors hover:bg-white/10",
                                    option === o.value ? "font-medium text-white" : "text-white/70",
                                )}
                                onClick={() => handleSelect(o.value)}
                            >
                                <span>{o.label}</span>
                                {option === o.value && (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                        <path
                                            d="M2 7l3.5 3.5L12 3"
                                            stroke="currentColor"
                                            strokeWidth="1.8"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                )}
                            </button>
                        ))}
                        {remainingSec !== null && (
                            <p className="px-4 pb-0.5 pt-1 text-xs tabular-nums text-white/40">
                                Remaining: {formatRemaining(remainingSec)}
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Remaining chip — rendered on the player canvas
// ---------------------------------------------------------------------------

interface SleepTimerChipProps {
    remainingSec: number | null;
    option: SleepTimerOption;
}

export const SleepTimerChip = ({ remainingSec, option }: SleepTimerChipProps) => {
    if (option === "off") return null;

    const label = option === "end" ? "End of video" : remainingSec !== null ? formatRemaining(remainingSec) : null;
    if (!label) return null;

    return (
        <div className="pointer-events-none absolute bottom-20 right-4 z-40 flex select-none items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
            <Moon size={12} strokeWidth={2.25} className="shrink-0" />
            <span className="tabular-nums">{label}</span>
        </div>
    );
};
