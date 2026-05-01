import Link from "next/link";

import { cn } from "@/lib/utils";

interface LibraryRowProps {
    heading: string;
    seeAllHref?: string;
    children: React.ReactNode;
    className?: string;
    emptyMessage?: string;
    isEmpty?: boolean;
}

// Horizontal scrolling card row with a heading and optional "See all" link.
// Renders children in a scrollable flex row; consumers supply the cards.
export const LibraryRow = ({ heading, seeAllHref, children, className, emptyMessage, isEmpty }: LibraryRowProps) => {
    return (
        <section className={cn("space-y-3", className)}>
            <div className="flex items-center justify-between px-4 md:px-6">
                <h2 className="text-base font-semibold text-foreground">{heading}</h2>
                {seeAllHref && (
                    <Link
                        href={seeAllHref}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        See all
                    </Link>
                )}
            </div>

            {isEmpty ? (
                <p className="px-4 md:px-6 text-sm text-muted-foreground">
                    {emptyMessage ?? "Nothing here yet."}
                </p>
            ) : (
                <div
                    className="flex gap-3 overflow-x-auto px-4 pb-2 md:px-6 scrollbar-hide"
                    style={{ scrollbarWidth: "none" }}
                >
                    {children}
                </div>
            )}
        </section>
    );
};
