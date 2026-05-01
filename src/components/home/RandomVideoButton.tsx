"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DiceIcon } from "hugeicons-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/**
 * Pulls a random public+ready video and routes to its watch page. Lives in
 * the header strip on /home and (optionally) other surfaces. Disables itself
 * during the in-flight fetch so a double-click doesn't fire two redirects.
 */
export const RandomVideoButton = () => {
    const router = useRouter();
    const utils = api.useUtils();
    const [pending, setPending] = useState(false);

    const handleClick = async () => {
        if (pending) return;
        setPending(true);
        try {
            const picked = await utils.video.random.fetch();
            if (!picked) {
                toast.message("No videos to surprise you with — yet.");
                return;
            }
            const watchId = picked.publicId ?? picked.id;
            const href = picked.unlistedSlug ? `/watch/${watchId}?slug=${picked.unlistedSlug}` : `/watch/${watchId}`;
            router.push(href);
        } catch {
            toast.error("Could not pick a random video.");
        } finally {
            setPending(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => void handleClick()}
            disabled={pending}
            aria-label="Play a random video"
            title="Play a random video"
            className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium",
                "text-foreground transition-colors hover:bg-secondary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
            )}
        >
            <DiceIcon size={18} strokeWidth={1.6} />
            <span className="hidden sm:inline">Random</span>
        </button>
    );
};
