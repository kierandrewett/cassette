import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// TagChip — a small pill that links to /search?q=&tag=<tag>
// ---------------------------------------------------------------------------

interface TagChipProps {
    tag: string;
    className?: string;
}

/**
 * Renders a single tag as a clickable pill that links to the search page
 * pre-filtered by that tag.
 */
export const TagChip = ({ tag, className }: TagChipProps) => {
    const href = `/search?q=&tag=${encodeURIComponent(tag)}`;

    return (
        <a
            href={href}
            className={cn(
                "inline-flex items-center rounded-full border border-border bg-secondary/60 px-2.5 py-0.5",
                "text-xs font-medium text-foreground/80 transition-colors",
                "hover:bg-secondary hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                className,
            )}
        >
            #{tag}
        </a>
    );
};

// ---------------------------------------------------------------------------
// TagChipRow — renders a list of tags as a row of TagChips
// ---------------------------------------------------------------------------

interface TagChipRowProps {
    tags: string[];
    className?: string;
}

export const TagChipRow = ({ tags, className }: TagChipRowProps) => {
    if (tags.length === 0) return null;

    return (
        <div className={cn("flex flex-wrap gap-1.5", className)}>
            {tags.map((tag) => (
                <TagChip key={tag} tag={tag} />
            ))}
        </div>
    );
};
