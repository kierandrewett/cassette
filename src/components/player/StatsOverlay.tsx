"use client";

import { useEffect, useState } from "react";
import { useMediaPlayer, useMediaState } from "@vidstack/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatsSnapshot {
    resolution: string;
    bandwidth: string;
    bufferedAhead: string;
    droppedFrames: string;
    downlink: string;
    codec: string;
    currentTime: string;
    duration: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

declare global {
    interface Navigator {
        // Network Information API — not in all TS lib versions.
        readonly connection?: {
            readonly downlink?: number;
            readonly effectiveType?: string;
        };
    }
}

const formatTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
};

const na = "—";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StatsOverlayProps {
    visible: boolean;
}

export const StatsOverlay = ({ visible }: StatsOverlayProps) => {
    const player = useMediaPlayer();
    const quality = useMediaState("quality");
    const bufferedEnd = useMediaState("bufferedEnd");
    const currentTime = useMediaState("currentTime");
    const duration = useMediaState("duration");

    const [stats, setStats] = useState<StatsSnapshot>({
        resolution: na,
        bandwidth: na,
        bufferedAhead: na,
        droppedFrames: na,
        downlink: na,
        codec: na,
        currentTime: na,
        duration: na,
    });

    useEffect(() => {
        if (!visible) return;

        const tick = () => {
            const state = player?.state;

            // Resolution from the active quality rung.
            const resolution = quality?.height ? `${quality.height}p` : na;

            // Bandwidth estimate from Vidstack state (bps → kbps).
            const bwKbps =
                state && "networkState" in state
                    ? na
                    : na; // Vidstack doesn't expose bw estimate directly in headless mode

            // Try to read from the HTMLVideoElement via player.el.
            let bandwidth = bwKbps;
            let droppedFrames = na;

            if (typeof window !== "undefined" && player) {
                // Dropped frames via the Video Quality API (Chrome/Edge).
                const videoEl = player.el?.querySelector("video") as HTMLVideoElement | null;
                if (videoEl) {
                    const vq = (videoEl as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number } }).getVideoPlaybackQuality?.();
                    if (vq) {
                        droppedFrames = String(vq.droppedVideoFrames);
                    }
                }
            }

            // Bandwidth from quality object if available.
            const qual = quality as (typeof quality & { bandwidth?: number }) | null;
            if (qual?.bandwidth && qual.bandwidth > 0) {
                bandwidth = `${Math.round(qual.bandwidth / 1000)} kbps`;
            }

            // Buffered ahead of current time.
            const ahead = Math.max(0, bufferedEnd - currentTime);
            const bufferedAhead = `${ahead.toFixed(1)} s`;

            // Network downlink (Network Information API).
            const dl = navigator.connection?.downlink;
            const downlink = dl !== undefined ? `${dl} Mbps` : na;

            // Codec from the active quality object.
            const qAny = quality as (typeof quality & { codecs?: string }) | null;
            const codec = qAny?.codecs ?? na;

            setStats({
                resolution,
                bandwidth,
                bufferedAhead,
                droppedFrames,
                downlink,
                codec,
                currentTime: formatTime(currentTime),
                duration: formatTime(duration),
            });
        };

        tick(); // immediate first read
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [visible, player, quality, bufferedEnd, currentTime, duration]);

    if (!visible) return null;

    return (
        <div
            className="player-popover absolute left-3 top-16 z-50 rounded-xl px-3 py-2.5 select-none pointer-events-none"
            aria-label="Stats for nerds"
            aria-live="polite"
        >
            <p className="mb-1 text-xs font-medium text-white/50 uppercase tracking-wider">
                Stats for nerds
            </p>
            <div className="space-y-0.5 text-xs text-white/80">
                <Row label="Resolution" value={stats.resolution} />
                <Row label="Bandwidth" value={stats.bandwidth} />
                <Row label="Buffered" value={stats.bufferedAhead} />
                <Row label="Dropped frames" value={stats.droppedFrames} />
                <Row label="Downlink" value={stats.downlink} />
                <Row label="Codec" value={stats.codec} />
                <Row label="Position" value={`${stats.currentTime} / ${stats.duration}`} />
            </div>
        </div>
    );
};

const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between gap-4 whitespace-nowrap tabular-nums">
        <span className="text-white/55">{label}</span>
        <span className="text-white/95">{value}</span>
    </div>
);
