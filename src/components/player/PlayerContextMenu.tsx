"use client";

import { useMediaPlayer, useMediaRemote, useMediaState } from "@vidstack/react";
import { Copy, Download, Info, Link as LinkIcon, Pause, Play, Repeat } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { readPreferences, writeStatsOverlayEnabled } from "@/lib/player/preferences";
import { cn } from "@/lib/utils";

interface PlayerContextMenuProps {
    /** Video id — used to derive the canonical share URL. */
    videoId: string;
}

interface MenuPosition {
    x: number;
    y: number;
}

/**
 * Custom right-click context menu for the player.
 *
 * Replaces the browser's default context menu with a glass-blur surface that
 * matches the rest of the player chrome.  Listens for `contextmenu` on the
 * MediaPlayer root element (resolved via `useMediaPlayer().el`) and pops the
 * menu at the cursor.  Dismisses on outside click, Escape, blur, or scroll.
 *
 * Items:
 *   - Play / Pause
 *   - Toggle loop
 *   - Copy link to current time
 *   - Copy link
 *   - Save thumbnail (rasterised current frame)
 *   - Stats for nerds (toggle)
 *   ---
 *   - Powered by cassette (footer)
 */
export const PlayerContextMenu = ({ videoId }: PlayerContextMenuProps) => {
    const player = useMediaPlayer();
    const remote = useMediaRemote();
    const paused = useMediaState("paused");
    const loop = useMediaState("loop");
    const pathname = usePathname();

    const [pos, setPos] = useState<MenuPosition | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const open = pos !== null;
    const close = () => setPos(null);

    // Wire contextmenu on the player root.  We attach to `player.el` (the
    // <media-player> custom element) so the listener is scoped — right
    // clicks outside the player still get the browser default.
    useEffect(() => {
        const el = player?.el;
        if (!el) return;

        const onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            // Clamp to viewport so the menu doesn't render off-screen on the
            // right or bottom edge.  We use a generous 240×280 hit-box and
            // re-clamp via the inline style once we have the actual size.
            setPos({ x: e.clientX, y: e.clientY });
        };

        el.addEventListener("contextmenu", onContextMenu);
        return () => el.removeEventListener("contextmenu", onContextMenu);
    }, [player]);

    // Outside-click + Escape + scroll to close.
    useEffect(() => {
        if (!open) return;

        const onClickOutside = (e: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(e.target as Node)) {
                close();
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        const onScroll = () => close();

        // Defer click handler by a tick so the contextmenu's own click
        // doesn't immediately dismiss the menu.
        const t = setTimeout(() => {
            document.addEventListener("mousedown", onClickOutside);
        }, 0);
        document.addEventListener("keydown", onKey);
        window.addEventListener("scroll", onScroll, true);

        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", onClickOutside);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [open]);

    if (!open) return null;

    const handlePlayPause = () => {
        if (paused) void remote.play();
        else void remote.pause();
        close();
    };

    const handleToggleLoop = () => {
        // Vidstack's MediaPlayer state surfaces `loop` as readonly; the
        // underlying <video> element accepts the standard HTMLMediaElement
        // `loop` attribute, which Vidstack mirrors back into state.
        const videoEl = player?.el?.querySelector("video") as HTMLVideoElement | null;
        if (videoEl) {
            videoEl.loop = !loop;
            toast(videoEl.loop ? "Loop on" : "Loop off");
        }
        close();
    };

    const buildLink = (withTimestamp: boolean): string => {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const path = pathname ?? `/watch/${videoId}`;
        if (!withTimestamp) return `${origin}${path}`;
        const t = Math.max(0, Math.floor(player?.state.currentTime ?? 0));
        return `${origin}${path}?t=${t}`;
    };

    const copyToClipboard = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(label);
        } catch {
            toast.error("Could not copy to clipboard");
        }
        close();
    };

    const handleCopyLinkAtTime = () => {
        void copyToClipboard(buildLink(true), "Link with timestamp copied");
    };

    const handleCopyLink = () => {
        void copyToClipboard(buildLink(false), "Link copied");
    };

    const handleSaveThumbnail = () => {
        // Grab the underlying <video> element from the player root and draw
        // its current frame to an off-screen canvas, then trigger a download.
        // crossOrigin is set on MediaPlayer so the canvas should not be
        // tainted for HLS segments served from the same origin.
        try {
            const videoEl = player?.el?.querySelector("video") as HTMLVideoElement | null;
            if (!videoEl) {
                toast.error("Could not capture frame");
                close();
                return;
            }
            const canvas = document.createElement("canvas");
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                toast.error("Could not capture frame");
                close();
                return;
            }
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) {
                    toast.error("Could not capture frame");
                    return;
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const t = Math.floor(player?.state.currentTime ?? 0);
                a.download = `cassette-${videoId}-${t}s.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success("Thumbnail saved");
            }, "image/png");
        } catch {
            toast.error("Could not capture frame");
        }
        close();
    };

    const handleToggleStats = () => {
        const next = !readPreferences().statsOverlayEnabled;
        writeStatsOverlayEnabled(next);
        window.dispatchEvent(new CustomEvent("cassette:stats-toggle", { detail: { enabled: next } }));
        close();
    };

    // Position the menu, clamping to the viewport with a 240×320 hint.
    const MENU_W = 240;
    const MENU_H = 320;
    const left = Math.min(pos.x, (typeof window !== "undefined" ? window.innerWidth : 0) - MENU_W - 8);
    const top = Math.min(pos.y, (typeof window !== "undefined" ? window.innerHeight : 0) - MENU_H - 8);

    return (
        <div
            ref={menuRef}
            role="menu"
            className="player-popover fixed z-[100] w-60 overflow-hidden rounded-xl py-1.5"
            style={{ left: Math.max(8, left), top: Math.max(8, top) }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <Item
                icon={
                    paused ? (
                        <Play size={16} fill="currentColor" strokeWidth={0} />
                    ) : (
                        <Pause size={16} fill="currentColor" strokeWidth={0} />
                    )
                }
                onClick={handlePlayPause}
            >
                {paused ? "Play" : "Pause"}
            </Item>
            <Item icon={<Repeat size={16} strokeWidth={2.25} />} onClick={handleToggleLoop} active={loop}>
                Toggle loop
                {loop && <span className="ml-auto text-xs text-white/50">on</span>}
            </Item>
            <Divider />
            <Item icon={<LinkIcon size={16} strokeWidth={2.25} />} onClick={handleCopyLinkAtTime}>
                Copy link to current time
            </Item>
            <Item icon={<Copy size={16} strokeWidth={2.25} />} onClick={handleCopyLink}>
                Copy link
            </Item>
            <Item icon={<Download size={16} strokeWidth={2.25} />} onClick={handleSaveThumbnail}>
                Save thumbnail&hellip;
            </Item>
            <Divider />
            <Item icon={<Info size={16} strokeWidth={2.25} />} onClick={handleToggleStats}>
                Stats for nerds
            </Item>
            <Divider />
            <p className="px-3 pb-0.5 pt-1 text-[10px] uppercase tracking-wider text-white/35">Powered by cassette</p>
        </div>
    );
};

// ---- Sub-components ----

const Item = ({
    icon,
    onClick,
    children,
    active,
}: {
    icon: React.ReactNode;
    onClick: () => void;
    children: React.ReactNode;
    active?: boolean;
}) => (
    <button
        role="menuitem"
        onClick={onClick}
        className={cn(
            "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors",
            "hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none",
            active ? "text-white" : "text-white/85",
        )}
    >
        <span className="shrink-0 text-white/70">{icon}</span>
        <span className="flex flex-1 items-center truncate">{children}</span>
    </button>
);

const Divider = () => <div className="my-1 h-px bg-white/10" aria-hidden="true" />;
