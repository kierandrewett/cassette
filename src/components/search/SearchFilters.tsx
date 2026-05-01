"use client";

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
    { label: "Any time",    value: undefined },
    { label: "Last hour",   value: "hour" },
    { label: "Today",       value: "today" },
    { label: "This week",   value: "week" },
    { label: "This month",  value: "month" },
    { label: "This year",   value: "year" },
];

const DURATION_OPTIONS: Array<{ label: string; value: Duration | undefined }> = [
    { label: "Any duration", value: undefined },
    { label: "Short (< 4 min)",    value: "short" },
    { label: "Medium (4–20 min)",  value: "medium" },
    { label: "Long (> 20 min)",    value: "long" },
];

export const SearchFilters = () => {
    const rawParams = useSearchParams();

    // Convert ReadonlyURLSearchParams to a URLSearchParams-compatible object.
    const params = new URLSearchParams(rawParams.toString());
    const filters: SearchFilterState = parseSearchFilters(params);

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
        </div>
    );
};
