import { cn } from "@/lib/utils";

interface CassetteWordmarkProps {
    className?: string;
    /** Show just the icon (for collapsed rail). */
    iconOnly?: boolean;
}

// Inline SVG cassette tape icon + "cassette" wordmark.
// No external font or image assets — ASCII-clean, system-ui only.
export const CassetteWordmark = ({ className, iconOnly = false }: CassetteWordmarkProps) => {
    return (
        <span className={cn("inline-flex items-center gap-2", className)}>
            {/* Cassette tape icon — simplified reel silhouette */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                {/* Tape body */}
                <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                {/* Left reel */}
                <circle cx="8" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="12" r="0.75" fill="currentColor" />
                {/* Right reel */}
                <circle cx="16" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="16" cy="12" r="0.75" fill="currentColor" />
                {/* Tape window bottom edge */}
                <path
                    d="M5.5 17 Q8 14.5 12 14.5 Q16 14.5 18.5 17"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                />
                {/* Top notch */}
                <rect x="10" y="3.5" width="4" height="2" rx="0.5" fill="currentColor" />
            </svg>
            {!iconOnly && (
                <span className="select-none text-base font-semibold tracking-tight text-foreground">cassette</span>
            )}
        </span>
    );
};
