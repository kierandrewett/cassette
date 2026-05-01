"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Code2, Link2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ShareDialogProps {
    videoId: string;
    /** The unlisted slug, if applicable. Appended as ?slug=<slug> for unlisted videos. */
    slug?: string | null;
    /** If true, clipboard copy is disabled and a tooltip explains why. */
    isPrivate?: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Listen for the player's broadcasted current-time event so we can pre-fill
// `?t=<seconds>` in the share URL when the user has scrubbed away from 0.
//
// Player.tsx dispatches `cassette:position` with `{ seconds }` ~4×/s. We
// keep our local state at 0 until the dialog opens; on open we wait for
// the next tick (or use the most recent value if available) so the URL
// reflects the moment the user clicked "Share".
const POSITION_EVENT = "cassette:position";

export const ShareDialog = ({ videoId, slug, isPrivate = false, open, onOpenChange }: ShareDialogProps) => {
    const [copiedKind, setCopiedKind] = useState<"link" | "embed" | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [embedOptionsOpen, setEmbedOptionsOpen] = useState(false);
    const [embedAutoplay, setEmbedAutoplay] = useState(false);
    const [embedMuted, setEmbedMuted] = useState(true);
    const [embedLoop, setEmbedLoop] = useState(false);
    const [embedStart, setEmbedStart] = useState(0);

    // Snapshot current player position when the dialog opens. The player
    // broadcasts position regardless — we just remember the latest tick.
    const lastPositionRef = useRef(0);
    const [includeTimestamp, setIncludeTimestamp] = useState(false);
    const [snapshotSec, setSnapshotSec] = useState(0);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ seconds: number }>).detail;
            if (typeof detail?.seconds === "number") {
                lastPositionRef.current = detail.seconds;
            }
        };
        window.addEventListener(POSITION_EVENT, handler);
        return () => window.removeEventListener(POSITION_EVENT, handler);
    }, []);

    useEffect(() => {
        if (!open) return;
        const sec = Math.floor(lastPositionRef.current);
        setSnapshotSec(sec);
        setIncludeTimestamp(sec > 0);
    }, [open]);

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const url = useMemo(() => {
        const params = new URLSearchParams();
        if (slug) params.set("slug", slug);
        if (includeTimestamp && snapshotSec > 0) params.set("t", String(snapshotSec));
        const qs = params.toString();
        return `${origin}/watch/${videoId}${qs ? `?${qs}` : ""}`;
    }, [origin, videoId, slug, includeTimestamp, snapshotSec]);

    const embedSrc = useMemo(() => {
        const params = new URLSearchParams();
        if (slug) params.set("slug", slug);
        if (embedAutoplay) params.set("autoplay", "1");
        if (embedMuted || embedAutoplay) params.set("muted", "1");
        if (embedLoop) params.set("loop", "1");
        if (embedStart > 0) params.set("start", String(embedStart));
        const qs = params.toString();
        return `${origin}/embed/${videoId}${qs ? `?${qs}` : ""}`;
    }, [origin, videoId, slug, embedAutoplay, embedMuted, embedLoop, embedStart]);

    const embedSnippet = useMemo(
        () =>
            `<iframe src="${embedSrc}" width="640" height="360" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`,
        [embedSrc],
    );

    const flashCopied = (kind: "link" | "embed") => {
        setCopiedKind(kind);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedKind(null), 1500);
    };

    const handleCopyLink = async () => {
        if (isPrivate) return;
        try {
            await navigator.clipboard.writeText(url);
            flashCopied("link");
        } catch {
            // Fallback: user can manually select the input contents.
        }
    };

    const handleCopyEmbed = async () => {
        if (isPrivate) return;
        try {
            await navigator.clipboard.writeText(embedSnippet);
            flashCopied("embed");
        } catch {
            // Fallback only.
        }
    };

    useEffect(
        () => () => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        },
        [],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Share</DialogTitle>
                </DialogHeader>

                {/* Link */}
                <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Link</p>
                    <Input
                        readOnly
                        value={url}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="flex-1 bg-secondary/50 font-mono text-xs text-foreground/80"
                        aria-label="Video URL"
                    />
                    {snapshotSec > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={includeTimestamp}
                                onChange={(e) => setIncludeTimestamp(e.target.checked)}
                                className="h-3.5 w-3.5 accent-foreground"
                            />
                            Start at {formatSecondsHms(snapshotSec)}
                        </label>
                    )}
                    {isPrivate ? (
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="inline-block w-full">
                                        <Button
                                            variant="secondary"
                                            className="w-full cursor-not-allowed opacity-50"
                                            disabled
                                            aria-disabled="true"
                                        >
                                            <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                            Copy link
                                        </Button>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    Playback of this video requires a signed-in member. The link is only accessible to
                                    authorised viewers.
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        <Button variant="secondary" className="w-full" onClick={handleCopyLink} aria-live="polite">
                            {copiedKind === "link" ? (
                                <>
                                    <Check className="mr-2 h-4 w-4 text-green-500" aria-hidden="true" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                    Copy link
                                </>
                            )}
                        </Button>
                    )}
                </div>

                {/* Embed */}
                {isPrivate ? null : (
                    <div className="space-y-2 border-t border-border pt-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Embed</p>
                        <textarea
                            readOnly
                            value={embedSnippet}
                            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                            className="h-20 w-full flex-1 resize-none rounded-md border border-border bg-secondary/50 p-2 font-mono text-[11px] text-foreground/80"
                            aria-label="Embed snippet"
                        />

                        <button
                            type="button"
                            onClick={() => setEmbedOptionsOpen((v) => !v)}
                            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            aria-expanded={embedOptionsOpen}
                        >
                            {embedOptionsOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Options
                        </button>

                        {embedOptionsOpen && (
                            <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
                                <EmbedCheckbox
                                    id="embed-autoplay"
                                    label="Autoplay"
                                    checked={embedAutoplay}
                                    onChange={(v) => {
                                        setEmbedAutoplay(v);
                                        if (v) setEmbedMuted(true);
                                    }}
                                />
                                <EmbedCheckbox
                                    id="embed-muted"
                                    label="Muted"
                                    checked={embedMuted || embedAutoplay}
                                    onChange={setEmbedMuted}
                                    disabled={embedAutoplay}
                                />
                                <EmbedCheckbox
                                    id="embed-loop"
                                    label="Loop"
                                    checked={embedLoop}
                                    onChange={setEmbedLoop}
                                />
                                <div className="flex items-center gap-2">
                                    <label
                                        htmlFor="embed-start"
                                        className="w-24 shrink-0 text-xs text-muted-foreground"
                                    >
                                        Start at (s)
                                    </label>
                                    <input
                                        id="embed-start"
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={embedStart}
                                        onChange={(e) => setEmbedStart(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                        className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                    />
                                </div>
                            </div>
                        )}

                        <Button variant="secondary" className="w-full" onClick={handleCopyEmbed} aria-live="polite">
                            {copiedKind === "embed" ? (
                                <>
                                    <Check className="mr-2 h-4 w-4 text-green-500" aria-hidden="true" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Code2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                    Copy embed code
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

const EmbedCheckbox = ({
    id,
    label,
    checked,
    onChange,
    disabled = false,
}: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) => (
    <div className="flex items-center gap-2">
        <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="h-3.5 w-3.5 cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        <label
            htmlFor={id}
            className={cn("cursor-pointer text-xs text-muted-foreground", disabled && "cursor-not-allowed opacity-50")}
        >
            {label}
        </label>
    </div>
);

const formatSecondsHms = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h${m}m${s}s`;
    if (m > 0) return `${m}m${s}s`;
    return `${s}s`;
};
