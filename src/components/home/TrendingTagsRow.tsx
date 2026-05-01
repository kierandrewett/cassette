import Link from "next/link";

import { cn } from "@/lib/utils";

interface TrendingTag {
    tag: string;
    uses: number;
}

interface TrendingTagsRowProps {
    tags: TrendingTag[];
    className?: string;
}

/**
 * Horizontal scroll row of pill chips above the home grid. Server-rendered;
 * an explicit overflow-x ensures the row stays a single row on narrow
 * screens rather than wrapping into a two-line block.
 */
export const TrendingTagsRow = ({ tags, className }: TrendingTagsRowProps) => {
    if (tags.length === 0) return null;

    return (
        <nav aria-label="Trending tags" className={cn("min-w-0", className)}>
            <ul className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tags.map(({ tag }) => (
                    <li key={tag} className="shrink-0">
                        <Link
                            href={`/search?q=&tag=${encodeURIComponent(tag)}`}
                            className={cn(
                                "inline-flex items-center rounded-full border border-border bg-secondary/60 px-3 py-1.5",
                                "text-xs font-medium text-foreground/80 transition-colors",
                                "hover:bg-secondary hover:text-foreground",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            )}
                        >
                            #{tag}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
};
