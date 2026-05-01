"use client";

import { useEffect, useState } from "react";

import { readPreferences, writeHoverPreviewsEnabled } from "@/lib/player/preferences";

/**
 * Client component for the Preferences section in /settings.
 * Reads and writes user preferences from localStorage.
 */
export const PreferencesPanel = () => {
    const [hoverPreviews, setHoverPreviews] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Read the stored preference on the client only (localStorage is not available during SSR).
    useEffect(() => {
        setHoverPreviews(readPreferences().hoverPreviewsEnabled);
        setMounted(true);
    }, []);

    const handleToggle = () => {
        const next = !hoverPreviews;
        setHoverPreviews(next);
        writeHoverPreviewsEnabled(next);
    };

    // Render a stable placeholder during SSR to avoid hydration mismatches.
    if (!mounted) {
        return (
            <PreferencesRow label="Hover previews" description="" checked={true} onChange={() => undefined} disabled />
        );
    }

    return (
        <PreferencesRow
            label="Hover previews"
            description="Show animated previews of videos when you hover over them. Turn this off if your network is metered."
            checked={hoverPreviews}
            onChange={handleToggle}
        />
    );
};

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

interface PreferencesRowProps {
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}

const PreferencesRow = ({ label, description, checked, onChange, disabled }: PreferencesRowProps) => (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
        <div className="min-w-0 space-y-0.5">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <button
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={onChange}
            className={[
                "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                "transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                checked ? "bg-primary" : "bg-muted",
            ].join(" ")}
        >
            <span
                aria-hidden="true"
                className={[
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm",
                    "transform transition duration-200 ease-in-out",
                    checked ? "translate-x-4" : "translate-x-0",
                ].join(" ")}
            />
        </button>
    </div>
);
