"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";

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
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Build the full URL client-side so SSR doesn't need the host.
    const url =
        typeof window !== "undefined"
            ? `${window.location.origin}/watch/${videoId}${slug ? `?slug=${slug}` : ""}`
            : `/watch/${videoId}${slug ? `?slug=${slug}` : ""}`;

    const handleCopy = async () => {
        if (isPrivate) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback: select the input text so the user can copy manually.
        }
    };

    // Clear timer on unmount.
    useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

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

            <PopoverContent className="w-80 space-y-3 p-4" align="end">
                <p className="text-sm font-semibold text-foreground">Share</p>

                {/* URL display */}
                <div className="flex gap-2">
                    <Input
                        readOnly
                        value={url}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="flex-1 text-xs font-mono text-foreground/80 bg-secondary/50"
                        aria-label="Video URL"
                    />
                </div>

                {/* Copy link button */}
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
                        onClick={handleCopy}
                        aria-live="polite"
                    >
                        {copied ? (
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
