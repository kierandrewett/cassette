"use client";

import { useMediaState } from "@vidstack/react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatDuration } from "@/lib/utils";

interface NextVideo {
    id: string;
    title: string;
    thumbnailPath: string | null;
    channel: { name: string; handle: string };
    durationSec: number | null;
}

interface UpNextOverlayProps {
    next: NextVideo | null;
}

const COUNTDOWN_SEC = 10;

/**
 * Bottom-right card visible during the last 10 seconds of playback.
 * Shows the next video's thumbnail, title, and a countdown ring.
 * Auto-advances on ended (if not dismissed). X to dismiss.
 */
export const UpNextOverlay = ({ next }: UpNextOverlayProps) => {
    const duration = useMediaState("duration");
    const currentTime = useMediaState("currentTime");
    const ended = useMediaState("ended");
    const [dismissed, setDismissed] = useState(false);
    const router = useRouter();
    const hasNavigated = useRef(false);

    const timeLeft = Math.max(0, duration - currentTime);
    const showOverlay = next && !dismissed && timeLeft <= COUNTDOWN_SEC && duration > 0;

    const countdown = Math.ceil(timeLeft);
    const progress = 1 - timeLeft / COUNTDOWN_SEC;

    // Navigate on ended if not dismissed.
    useEffect(() => {
        if (ended && next && !dismissed && !hasNavigated.current) {
            hasNavigated.current = true;
            router.push(`/watch/${next.id}`);
        }
    }, [ended, next, dismissed, router]);

    // Navigate immediately.
    const handleAdvance = () => {
        if (!next || hasNavigated.current) return;
        hasNavigated.current = true;
        router.push(`/watch/${next.id}`);
    };

    if (!showOverlay) return null;

    return (
        <div
            className={`
                pointer-events-auto absolute bottom-24 right-4 z-40 w-64
                surface-glass rounded-xl overflow-hidden shadow-2xl
                animate-in slide-in-from-right-4 fade-in duration-300
            `}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-xs font-medium text-white/60 uppercase tracking-wider">Up Next</span>
                <button
                    aria-label="Dismiss"
                    onClick={() => setDismissed(true)}
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Thumbnail + countdown */}
            <div className="relative cursor-pointer" onClick={handleAdvance}>
                <div className="aspect-video bg-black/50">
                    {next.thumbnailPath ? (
                        <img
                            src={`/api/hls/${next.id}/thumb/sprite.jpg`}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="h-full w-full bg-secondary" />
                    )}
                </div>

                {/* Countdown ring overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <CountdownRing progress={progress} seconds={countdown} />
                </div>
            </div>

            {/* Meta */}
            <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium text-white leading-snug">{next.title}</p>
                <p className="mt-0.5 text-xs text-white/50">{next.channel.name}</p>
                {next.durationSec && (
                    <p className="text-xs text-white/40 tabular-nums">{formatDuration(next.durationSec)}</p>
                )}
            </div>
        </div>
    );
};

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const CountdownRing = ({ progress, seconds }: { progress: number; seconds: number }) => (
    <div className="relative flex h-14 w-14 items-center justify-center">
        <svg className="absolute inset-0" width="56" height="56" viewBox="0 0 56 56">
            {/* Track */}
            <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
            {/* Progress */}
            <circle
                cx="28"
                cy="28"
                r={RADIUS}
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: "stroke-dashoffset 0.3s linear" }}
            />
        </svg>
        <span className="text-base font-semibold text-white tabular-nums">{seconds}</span>
    </div>
);
