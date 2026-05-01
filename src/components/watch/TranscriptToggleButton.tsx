"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TranscriptSidebar } from "@/components/watch/TranscriptSidebar";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptionTrack {
    lang: string;
    label: string;
    isDefault: boolean;
}

interface TranscriptToggleButtonProps {
    videoId: string;
    captions: CaptionTrack[];
    signedToken?: string | null;
    /**
     * Controlled mode. When provided, the parent owns the open state — useful
     * when the trigger lives in a kebab menu and the button itself should not
     * render. Pair with `renderTrigger={false}` to render only the Sheet.
     */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Whether to render the inline button trigger. Defaults to true. */
    renderTrigger?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TranscriptToggleButton = ({
    videoId,
    captions,
    signedToken,
    open: openProp,
    onOpenChange,
    renderTrigger = true,
}: TranscriptToggleButtonProps) => {
    const [openInternal, setOpenInternal] = useState(false);
    const isControlled = typeof openProp === "boolean";
    const open = isControlled ? openProp : openInternal;
    const setOpen = (v: boolean) => {
        if (!isControlled) setOpenInternal(v);
        onOpenChange?.(v);
    };
    const disabled = captions.length === 0;

    const button = (
        <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setOpen(true)}
            aria-label="Show transcript"
            aria-expanded={open}
            className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "transition-colors",
                disabled
                    ? "cursor-not-allowed text-foreground/30"
                    : "text-foreground/80 hover:bg-white/5 hover:text-foreground",
            )}
        >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span>Transcript</span>
        </button>
    );

    return (
        <>
            {renderTrigger &&
                (disabled ? (
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {/* Wrap in a span so the disabled button still triggers the tooltip */}
                                <span className="inline-flex">{button}</span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">No transcript available for this video.</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    button
                ))}

            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent
                    side="right"
                    className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
                    aria-label="Transcript"
                >
                    <SheetHeader className="flex-shrink-0 border-b border-border px-6 py-4">
                        <SheetTitle>Transcript</SheetTitle>
                    </SheetHeader>

                    <div className="flex-1 overflow-hidden px-4 pb-4 pt-3">
                        <TranscriptSidebar videoId={videoId} captions={captions} signedToken={signedToken} />
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
};
