"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Video, Tv2, ListVideo } from "lucide-react";

import { vanillaTrpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface SearchAutocompleteProps {
    query: string;
    onClose: () => void;
}

type Suggestion = {
    kind: "video" | "channel" | "playlist";
    label: string;
    href: string;
};

const KindIcon = ({ kind }: { kind: Suggestion["kind"] }) => {
    switch (kind) {
        case "video":    return <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
        case "channel":  return <Tv2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
        case "playlist": return <ListVideo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    }
};

// Debounce helper — returns a stable callback that delays invocation.
const useDebounce = <T,>(value: T, delayMs: number): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(id);
    }, [value, delayMs]);
    return debounced;
};

export const SearchAutocomplete = ({ query, onClose }: SearchAutocompleteProps) => {
    const debouncedQuery = useDebounce(query.trim(), 200);
    const [activeIndex, setActiveIndex] = useState(-1);
    const listRef = useRef<HTMLUListElement>(null);

    // Use the vanilla (non-React) tRPC client with React Query directly so the
    // return type is fully under our control without depending on root.ts having
    // `search` registered (that happens in the orchestrator integration step).
    const { data: suggestions = [] } = useQuery<Suggestion[]>({
        queryKey: ["search.autocomplete", debouncedQuery],
        queryFn: async () => {
            if (debouncedQuery.length < 2) return [];
            // vanillaTrpc.search.autocomplete is available once the orchestrator
            // wires search: searchRouter into root.ts.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (vanillaTrpc as any).search.autocomplete.query({ q: debouncedQuery });
            return result as Suggestion[];
        },
        enabled: debouncedQuery.length >= 2,
        staleTime: 30_000,
        placeholderData: (prev: Suggestion[] | undefined) => prev,
    });

    // Reset active index when suggestions change.
    useEffect(() => {
        setActiveIndex(-1);
    }, [suggestions]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!suggestions.length) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, -1));
            } else if (e.key === "Enter" && activeIndex >= 0) {
                // Navigate to the highlighted suggestion — the Link's href
                // is the canonical destination; we trigger a click on it.
                const active = listRef.current?.querySelectorAll("a")[activeIndex];
                if (active) {
                    (active as HTMLAnchorElement).click();
                    onClose();
                }
            } else if (e.key === "Escape") {
                onClose();
            }
        },
        [suggestions, activeIndex, onClose],
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    if (!debouncedQuery || debouncedQuery.length < 2 || suggestions.length === 0) {
        return (
            <div className="px-3 py-2 text-sm text-muted-foreground">
                {query.trim() ? (
                    <span>Press Enter to search for &ldquo;{query}&rdquo;</span>
                ) : (
                    <span>Start typing to search&hellip;</span>
                )}
            </div>
        );
    }

    return (
        <ul ref={listRef} role="listbox" aria-label="Search suggestions" className="py-1">
            {suggestions.map((s, i) => (
                <li key={`${s.kind}-${s.href}`} role="option" aria-selected={i === activeIndex}>
                    <Link
                        href={s.href}
                        onClick={onClose}
                        className={cn(
                            "flex items-center gap-2.5 px-3 py-2 text-sm",
                            "hover:bg-accent hover:text-accent-foreground",
                            i === activeIndex && "bg-accent text-accent-foreground",
                        )}
                    >
                        <KindIcon kind={s.kind} />
                        <span className="truncate">{s.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground capitalize shrink-0">
                            {s.kind}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
};
