"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { useSession } from "@/lib/auth-client";
import { formatDuration } from "@/lib/utils";

const BEACON_INTERVAL_MS = 5000;

interface UseWatchBeaconOptions {
    videoId: string;
    getPositionSec: () => number;
    seek: (seconds: number) => void;
}

/**
 * Sends watch progress beacons every 5 s, on pause, and on unmount.
 * On mount, loads saved progress and offers a resume toast.
 *
 * Skips all beacon logic when the viewer is not signed in — the server
 * would reject the request anyway, and we avoid unnecessary network chatter.
 */
export const useWatchBeacon = ({ videoId, getPositionSec, seek }: UseWatchBeaconOptions): void => {
    const { data: session } = useSession();
    const isSignedIn = !!session?.user;
    const utils = api.useUtils();
    const recordProgress = api.video.recordProgress.useMutation();
    const hasOfferedResume = useRef(false);

    const sendBeacon = (positionSec: number) => {
        const body = JSON.stringify({
            "0": {
                json: {
                    videoId,
                    positionSec: Math.floor(positionSec),
                },
            },
        });

        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            // sendBeacon for reliability on page unload.
            navigator.sendBeacon("/api/trpc/video.recordProgress", new Blob([body], { type: "application/json" }));
        } else {
            // Fallback: regular mutation.
            recordProgress.mutate({ videoId, positionSec: Math.floor(positionSec) });
        }
    };

    // On mount: load saved progress and offer resume (signed-in only).
    useEffect(() => {
        if (!isSignedIn) return;
        if (hasOfferedResume.current) return;
        hasOfferedResume.current = true;

        void utils.video.getProgress
            .fetch({ videoId })
            .then((progress) => {
                if (!progress) return;
                const { positionSec, completed } = progress;
                if (positionSec > 5 && !completed) {
                    const label = formatDuration(positionSec);
                    toast(`Resume from ${label}`, {
                        duration: 8000,
                        action: {
                            label: "Restart",
                            onClick: () => seek(0),
                        },
                        onAutoClose: () => seek(positionSec),
                        onDismiss: () => seek(positionSec),
                    });
                }
            })
            .catch(() => {
                // Not authenticated or no progress — ignore.
            });
    }, [videoId, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    // Periodic beacon + on-unmount beacon (signed-in only).
    useEffect(() => {
        if (!isSignedIn) return;

        const interval = setInterval(() => {
            sendBeacon(getPositionSec());
        }, BEACON_INTERVAL_MS);

        // Flush on unmount (also covers page navigation).
        return () => {
            clearInterval(interval);
            sendBeacon(getPositionSec());
        };
    }, [videoId, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pause beacon is wired separately in Player.tsx via onPause.
};

/**
 * Standalone pause handler — call from MediaPlayer's onPause event.
 */
export const sendPauseBeacon = (videoId: string, positionSec: number): void => {
    const body = JSON.stringify({
        "0": {
            json: {
                videoId,
                positionSec: Math.floor(positionSec),
            },
        },
    });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/trpc/video.recordProgress", new Blob([body], { type: "application/json" }));
    }
};
