"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { type SearchFilters as SearchFilterState, parseSearchFilters, mutateFilter } from "./filterParams";
import type { UploadedWithin, Duration } from "./filterParams";

interface ChipProps {
    active: boolean;
    href: string;
    children: React.ReactNode;
}

// A pill chip that links to a URL; visually active when selected.
// Using <a> rather than router.push so keyboard navigation and middle-click
// work correctly for URL-based state.
const Chip = ({ active, href, children }: ChipProps) => {
    const router = useRouter();
    return (
        <button
            type="button"
            onClick={() => router.push(href)}
            className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            aria-pressed={active}
        >
            {children}
        </button>
    );
};

const DATE_OPTIONS: Array<{ label: string; value: UploadedWithin | undefined }> = [
    { label: "Any time", value: undefined },
    { label: "Last hour", value: "hour" },
    { label: "Today", value: "today" },
    { label: "This week", value: "week" },
    { label: "This month", value: "month" },
    { label: "This year", value: "year" },
];

const DURATION_OPTIONS: Array<{ label: string; value: Duration | undefined }> = [
    { label: "Any duration", value: undefined },
    { label: "Short (< 4 min)", value: "short" },
    { label: "Medium (4–20 min)", value: "medium" },
    { label: "Long (> 20 min)", value: "long" },
];

const TAG_RE = /^[a-z0-9-]+$/;

export const SearchFilters = () => {
    const router = useRouter();
    const rawParams = useSearchParams();
    const tagInputRef = useRef<HTMLInputElement>(null);

    // Convert ReadonlyURLSearchParams to a URLSearchParams-compatible object.
    const params = new URLSearchParams(rawParams.toString());
    const filters: SearchFilterState = parseSearchFilters(params);

    const onTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const raw = tagInputRef.current?.value.trim().toLowerCase() ?? "";
        if (!raw || !TAG_RE.test(raw) || raw.length > 30) return;
        router.push(mutateFilter(filters, { tag: raw }));
        if (tagInputRef.current) tagInputRef.current.value = "";
    };

    return (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
            {/* Upload date */}
            <div className="flex flex-wrap gap-2">
                {DATE_OPTIONS.map((opt) => (
                    <Chip
                        key={opt.value ?? "any-date"}
                        active={filters.uploadedWithin === opt.value}
                        href={mutateFilter(filters, { uploadedWithin: opt.value })}
                    >
                        {opt.label}
                    </Chip>
                ))}
            </div>

            {/* Duration */}
            <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((opt) => (
                    <Chip
                        key={opt.value ?? "any-duration"}
                        active={filters.duration === opt.value}
                        href={mutateFilter(filters, { duration: opt.value })}
                    >
                        {opt.label}
                    </Chip>
                ))}
            </div>

            {/* Features: has captions toggle */}
            <div className="flex flex-wrap gap-2">
                <Chip
                    active={filters.hasCaptions === true}
                    href={mutateFilter(filters, {
                        hasCaptions: filters.hasCaptions === true ? undefined : true,
                    })}
                >
                    Has captions
                </Chip>
            </div>

            {/* Tag filter */}
            <div className="flex flex-wrap items-center gap-2">
                {filters.tag ? (
                    // Active tag chip — shows the active tag with a remove button.
                    <span className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-3 py-1 text-sm font-medium text-background">
                        #{filters.tag}
                        <button
                            type="button"
                            aria-label={`Remove tag filter: ${filters.tag}`}
                            onClick={() => router.push(mutateFilter(filters, { tag: undefined }))}
                            className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                            </svg>
                        </button>
                    </span>
                ) : (
                    // Inactive: show a small text input that commits on Enter.
                    <input
                        ref={tagInputRef}
                        type="text"
                        placeholder="Filter by tag…"
                        onKeyDown={onTagKeyDown}
                        maxLength={30}
                        className={cn(
                            "h-8 rounded-full border border-border bg-transparent px-3 text-sm",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                    />
                )}
            </div>
        </div>
    );
};
