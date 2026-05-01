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
 * Sends watch progress every 5 s, on pause, and on unmount. Loads saved
 * progress on mount and offers a resume toast.
 *
 * Why not navigator.sendBeacon? Browsers coerce sendBeacon's Content-Type
 * to `text/plain` to skirt CORS preflight, which breaks tRPC's body parser
 * (it sees `req.json()` succeed but the un-batched POST shape no longer
 * matches what the procedure parser expects, and Zod fires "Required").
 * `fetch(..., { keepalive: true })` survives unload and keeps the JSON
 * Content-Type intact — it's the right tool for this job.
 *
 * Skips all beacon logic when the viewer is not signed in.
 */
export const useWatchBeacon = ({ videoId, getPositionSec, seek }: UseWatchBeaconOptions): void => {
    const { data: session } = useSession();
    const isSignedIn = !!session?.user;
    const utils = api.useUtils();
    const recordProgress = api.video.recordProgress.useMutation();
    const hasOfferedResume = useRef(false);

    const sendProgress = (positionSec: number) => {
        recordProgress.mutate({ videoId, positionSec: Math.floor(positionSec) });
    };

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
                        action: { label: "Restart", onClick: () => seek(0) },
                        onAutoClose: () => seek(positionSec),
                        onDismiss: () => seek(positionSec),
                    });
                }
            })
            .catch(() => {
                // Not authenticated or no progress — ignore.
            });
    }, [videoId, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isSignedIn) return;

        const interval = setInterval(() => sendProgress(getPositionSec()), BEACON_INTERVAL_MS);

        return () => {
            clearInterval(interval);
            // keepalive flush on unmount / navigation. fire-and-forget; the
            // tRPC client handles superjson + batching.
            sendProgress(getPositionSec());
        };
    }, [videoId, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps
};

/** Hook that returns a `flushProgress(positionSec)` callback — call from
 *  the player's onPause to record progress at the moment of pause. */
export const useFlushProgress = (videoId: string): ((positionSec: number) => void) => {
    const recordProgress = api.video.recordProgress.useMutation();
    return (positionSec: number) => {
        recordProgress.mutate({ videoId, positionSec: Math.floor(positionSec) });
    };
};
