"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Code2, Link2 } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
    videoId: string;
    /** The unlisted slug, if applicable. Appended as ?slug=<slug> for unlisted videos. */
    slug?: string | null;
    /** If true, clipboard copy is disabled and a tooltip explains why. */
    isPrivate?: boolean;
}

export const ShareButton = ({ videoId, slug, isPrivate = false }: ShareButtonProps) => {
    const [open, setOpen] = useState(false);
    const [copiedKind, setCopiedKind] = useState<"link" | "embed" | null>(null);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const url = `${origin}/watch/${videoId}${slug ? `?slug=${slug}` : ""}`;

    // Feature-detect Web Share API. On mobile (viewport <= 768 px) we hand off
    // to the OS share sheet directly instead of opening the Popover.
    const canNativeShare =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 768px)").matches;
    const embedSrc = `${origin}/embed/${videoId}${slug ? `?slug=${slug}` : ""}`;
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

    const handleNativeShare = () => {
        if (!canNativeShare) return;
        void navigator.share({ title: document.title, url });
    };

    useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

    // On mobile with Web Share API: bypass the Popover entirely.
    if (canNativeShare) {
        return (
            <button
                type="button"
                onClick={handleNativeShare}
                className={cn(
                    "flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground/80",
                    "hover:text-foreground hover:bg-white/5 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label="Share this video"
            >
                <ShareIcon />
                <span>Share</span>
            </button>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground/80",
                        "hover:text-foreground hover:bg-white/5 transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    aria-label="Share this video"
                >
                    <ShareIcon />
                    <span>Share</span>
                </button>
            </PopoverTrigger>

            <PopoverContent className="w-96 space-y-4 p-4" align="end">
                <p className="text-sm font-semibold text-foreground">Share</p>

                {/* Link section */}
                <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Link</p>
                    <Input
                        readOnly
                        value={url}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="flex-1 text-xs font-mono text-foreground/80 bg-secondary/50"
                        aria-label="Video URL"
                    />
                    {isPrivate ? (
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="inline-block w-full">
                                        <Button
                                            variant="secondary"
                                            className="w-full opacity-50 cursor-not-allowed"
                                            disabled
                                            aria-disabled="true"
                                        >
                                            <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                            Copy link
                                        </Button>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    Playback of this video requires a signed-in member. The link is only
                                    accessible to authorised viewers.
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={handleCopyLink}
                            aria-live="polite"
                        >
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

                {/* Embed section. Hidden on private (the iframe could not load). */}
                {isPrivate ? null : (
                    <div className="space-y-2 border-t border-border pt-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Embed
                        </p>
                        <textarea
                            readOnly
                            value={embedSnippet}
                            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                            className="flex-1 h-20 w-full resize-none rounded-md border border-border bg-secondary/50 p-2 text-[11px] font-mono text-foreground/80"
                            aria-label="Embed snippet"
                        />
                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={handleCopyEmbed}
                            aria-live="polite"
                        >
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
            </PopoverContent>
        </Popover>
    );
};

const ShareIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={1.8} aria-hidden="true">
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="16 6 12 2 8 6" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="2" x2="12" y2="15" strokeLinecap="round" />
    </svg>
);
