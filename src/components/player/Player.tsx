"use client";

import {
    Captions,
    MediaPlayer,
    MediaProvider,
    Track,
    useMediaPlayer,
    useMediaRemote,
    useMediaState,
} from "@vidstack/react";
import { useEffect, useRef } from "react";

import { SEEK_EVENT, usePlayerStore } from "@/lib/player/store";
import { readPreferences, writeVolume, writePlaybackRate } from "@/lib/player/preferences";
import type { Video, VideoCaption, VideoChapter, VideoVariant } from "@/server/db/schema/videos";
import { PlayerCanvas } from "./PlayerCanvas";
import { PlayerVignette } from "./PlayerVignette";
import { PlayerTopBar } from "./PlayerTopBar";
import { PlayerCenterStage } from "./PlayerCenterStage";
import { PlayerBottomBar } from "./PlayerBottomBar";
import { UpNextOverlay } from "./UpNextOverlay";
import { KeyboardShortcutsOverlay, useShortcutsOverlay } from "./KeyboardShortcutsOverlay";
import { useWatchBeacon, sendPauseBeacon } from "./useWatchBeacon";
import { useIdleControls } from "./useIdleControls";

interface NextVideo {
    id: string;
    title: string;
    thumbnailPath: string | null;
    channel: { name: string; handle: string };
    durationSec: number | null;
}

interface PlayerProps {
    video: Video;
    captions: VideoCaption[];
    chapters: VideoChapter[];
    variants: VideoVariant[];
    signedToken: string | null;
    // Next video in the queue or channel — used by UpNextOverlay.
    queueNext: NextVideo | null;
    channel: {
        handle: string;
        name: string;
        avatarPath: string | null;
    };
}

/**
 * Vidstack headless player with Apple-TV-style custom layout.
 *
 * Keyboard shortcuts wired via event listeners on the document:
 *   Space / K — play/pause
 *   J / L     — ±10 s
 *   ← / →     — ±5 s
 *   0-9        — seek to N×10%
 *   M          — mute
 *   ↑ / ↓     — volume ±10%
 *   F          — fullscreen
 *   T          — theatre
 *   C          — captions
 *   > / <      — speed +/-0.25
 */
export const Player = ({
    video,
    captions,
    chapters,
    variants,
    signedToken,
    queueNext,
    channel,
}: PlayerProps) => {
    const tokenQS = signedToken ? `?t=${signedToken}` : "";

    // Read stored captions preference once on render (SSR-safe).
    const storedCaptionsLang = typeof window !== "undefined"
        ? readPreferences().captionsLang
        : null;

    return (
        <MediaPlayer
            className="relative w-full overflow-hidden bg-black"
            style={{ aspectRatio: "16/9" }}
            src={`/api/hls/${video.id}/master.m3u8${tokenQS}`}
            crossOrigin
            playsInline
            streamType="on-demand"
            load="eager"
            keyShortcuts={{
                togglePaused: ["Space", "k"],
                seekBackward: "j",
                seekForward: "l",
                seekBackward5: "ArrowLeft",
                seekForward5: "ArrowRight",
                toggleMuted: "m",
                toggleFullscreen: "f",
                toggleCaptions: "c",
                volumeUp: "ArrowUp",
                volumeDown: "ArrowDown",
            }}
        >
            <MediaProvider>
                {/* Sprite VTT for scrubber thumbnail previews */}
                <Track
                    src={`/api/hls/${video.id}/thumb/sprite.vtt`}
                    kind="metadata"
                    default
                    label="thumbnails"
                />
                {/* Caption tracks — prefer stored language preference over DB isDefault flag. */}
                {captions.map((c) => (
                    <Track
                        key={c.lang}
                        src={`/api/hls/${video.id}/captions/${c.lang}.vtt${tokenQS}`}
                        kind="subtitles"
                        lang={c.lang}
                        label={c.label}
                        default={storedCaptionsLang !== null
                            ? c.lang === storedCaptionsLang
                            : c.isDefault}
                    />
                ))}
            </MediaProvider>

            {/* Rendered captions overlay */}
            <Captions
                className="absolute bottom-16 left-4 right-4 z-50 text-center"
            />

            <PlayerInner
                video={video}
                chapters={chapters}
                variants={variants}
                queueNext={queueNext}
                channel={channel}
                tokenQS={tokenQS}
            />
        </MediaPlayer>
    );
};

// Inner component so we can use Vidstack hooks (which require MediaPlayer as ancestor).
const PlayerInner = ({
    video,
    chapters,
    variants,
    queueNext,
    channel,
    // tokenQS reserved for future use (e.g. authenticating beacon requests)
    tokenQS: _tokenQS,
}: Omit<PlayerProps, "captions" | "signedToken"> & { tokenQS: string }) => {
    const remote = useMediaRemote();
    const player = useMediaPlayer();
    const paused = useMediaState("paused");
    const { active } = useIdleControls(paused);
    const toggleTheatre = usePlayerStore((s) => s.toggleTheatre);
    const targetSeekSec = usePlayerStore((s) => s.targetSeekSec);
    const clearSeek = usePlayerStore((s) => s.clearSeek);
    const { open: shortcutsOpen, setOpen: setShortcutsOpen } = useShortcutsOverlay();

    // Restore volume and playback rate from localStorage once the player is ready.
    useEffect(() => {
        if (!player) return;
        const prefs = readPreferences();

        const unsubscribe = player.subscribe(({ canPlay }) => {
            if (!canPlay) return;
            remote.changeVolume(prefs.volume);
            remote.changePlaybackRate(prefs.playbackRate);
            unsubscribe();
        });

        return unsubscribe;
    }, [player, remote]);

    // Persist volume changes (debounced inside writeVolume).
    useEffect(() => {
        if (!player) return;
        return player.subscribe(({ volume }) => {
            writeVolume(volume);
        });
    }, [player]);

    // Persist playback rate changes (debounced).
    useEffect(() => {
        if (!player) return;
        return player.subscribe(({ playbackRate }) => {
            writePlaybackRate(playbackRate);
        });
    }, [player]);

    // Apply programmatic seeks from the store (e.g., description timestamp clicks).
    useEffect(() => {
        if (targetSeekSec !== null) {
            remote.seek(targetSeekSec);
            clearSeek();
        }
    }, [targetSeekSec, remote, clearSeek]);

    // Also listen for the custom DOM event (description component dispatches this).
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ seconds: number }>).detail;
            if (typeof detail?.seconds === "number") {
                remote.seek(detail.seconds);
            }
        };
        document.addEventListener(SEEK_EVENT, handler);
        return () => document.removeEventListener(SEEK_EVENT, handler);
    }, [remote]);

    // Speed shortcuts: > and < (not in Vidstack's built-in key shortcut map).
    // Also handles T (theatre), I (PiP), 0-9 (% seek), and ? (shortcuts overlay).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;
            if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
                setShortcutsOpen((v) => !v);
            } else if (e.key === ">" || (e.key === "." && e.shiftKey)) {
                const currentRate = player?.state.playbackRate ?? 1;
                remote.changePlaybackRate(Math.min(2, currentRate + 0.25));
            } else if (e.key === "<" || (e.key === "," && e.shiftKey)) {
                const currentRate = player?.state.playbackRate ?? 1;
                remote.changePlaybackRate(Math.max(0.25, currentRate - 0.25));
            } else if (e.key === "t" || e.key === "T") {
                toggleTheatre();
            } else if (e.key === "i" || e.key === "I") {
                void remote.enterPictureInPicture();
            } else if (e.key.match(/^[0-9]$/)) {
                const pct = Number(e.key) / 10;
                const dur = player?.state.duration ?? 0;
                if (dur > 0) remote.seek(pct * dur);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [remote, player, toggleTheatre, setShortcutsOpen]);

    // Watch progress beacon wiring.
    const getPositionSec = () => player?.state.currentTime ?? 0;
    const seek = (seconds: number) => remote.seek(seconds);

    useWatchBeacon({ videoId: video.id, getPositionSec, seek });

    // Pause beacon.
    const handlePause = () => {
        sendPauseBeacon(video.id, getPositionSec());
    };

    return (
        <>
            {/* Pause beacon handler */}
            <PauseHandler onPause={handlePause} />

            {/* Keyboard shortcuts help dialog */}
            <KeyboardShortcutsOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

            <PlayerCanvas>
                <PlayerVignette />

                <PlayerTopBar
                    title={video.title}
                    channelName={channel.name}
                    channelHandle={channel.handle}
                    avatarPath={channel.avatarPath}
                    active={active}
                />

                <PlayerCenterStage />

                <PlayerBottomBar
                    videoId={video.id}
                    chapters={chapters}
                    variants={variants}
                    active={active}
                />

                <UpNextOverlay next={queueNext} />
            </PlayerCanvas>
        </>
    );
};

// Tiny component that hooks up the pause event handler.
const PauseHandler = ({ onPause }: { onPause: () => void }) => {
    const paused = useMediaState("paused");
    const hasStarted = useRef(false);

    useEffect(() => {
        if (!paused && !hasStarted.current) {
            hasStarted.current = true;
        }
        if (paused && hasStarted.current) {
            onPause();
        }
    }, [paused, onPause]);

    return null;
};
