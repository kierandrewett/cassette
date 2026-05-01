"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseVtt, type VttCue } from "@/lib/transcript/parse";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptionTrack {
    lang: string;
    label: string;
    isDefault: boolean;
}

interface TranscriptSidebarProps {
    videoId: string;
    captions: CaptionTrack[];
    signedToken?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds as mm:ss. */
const formatMmSs = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/** Highlight substrings matching `query` inside `text` with <mark>. */
const HighlightedText = ({ text, query }: { text: string; query: string }) => {
    if (!query) return <>{text}</>;

    const lower = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const parts: React.ReactNode[] = [];
    let pos = 0;
    let idx: number;

    while ((idx = lower.indexOf(lowerQuery, pos)) !== -1) {
        if (idx > pos) parts.push(text.slice(pos, idx));
        parts.push(
            <mark key={idx} className="rounded-sm bg-yellow-400/40 px-0.5 text-foreground">
                {text.slice(idx, idx + query.length)}
            </mark>,
        );
        pos = idx + query.length;
    }

    if (pos < text.length) parts.push(text.slice(pos));
    return <>{parts}</>;
};

// ---------------------------------------------------------------------------
// Per-fetch cache: (videoId, lang) → Promise<VttCue[]>
// ---------------------------------------------------------------------------

const fetchCache = new Map<string, Promise<VttCue[]>>();

const fetchCues = (videoId: string, lang: string, token?: string | null): Promise<VttCue[]> => {
    const key = `${videoId}/${lang}`;
    if (fetchCache.has(key)) return fetchCache.get(key)!;

    const url = `/api/hls/${videoId}/captions/${lang}.vtt${token ? `?t=${token}` : ""}`;
    const promise = fetch(url)
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
        })
        .then((text) => parseVtt(text))
        .catch(() => []);

    fetchCache.set(key, promise);
    return promise;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const TranscriptSidebar = ({ videoId, captions, signedToken }: TranscriptSidebarProps) => {
    // Pick the default language (isDefault flag, falling back to first track).
    const defaultLang = useMemo(() => captions.find((c) => c.isDefault)?.lang ?? captions[0]?.lang ?? "", [captions]);

    const [selectedLang, setSelectedLang] = useState<string>(defaultLang);
    const [cues, setCues] = useState<VttCue[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [query, setQuery] = useState<string>("");
    const [currentSec, setCurrentSec] = useState<number>(0);
    const [flashCueIdx, setFlashCueIdx] = useState<number | null>(null);

    const listRef = useRef<HTMLDivElement>(null);
    const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // -----------------------------------------------------------------------
    // Fetch cues when language or videoId changes.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!selectedLang) return;
        setLoading(true);
        setCues([]);
        void fetchCues(videoId, selectedLang, signedToken).then((result) => {
            setCues(result);
            setLoading(false);
        });
    }, [videoId, selectedLang, signedToken]);

    // -----------------------------------------------------------------------
    // Subscribe to cassette:position events from the player.
    // -----------------------------------------------------------------------
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{ seconds: number }>).detail;
            if (typeof detail?.seconds === "number") {
                setCurrentSec(detail.seconds);
            }
        };
        window.addEventListener("cassette:position", handler);
        return () => window.removeEventListener("cassette:position", handler);
    }, []);

    // -----------------------------------------------------------------------
    // Derive filtered cue list.
    // -----------------------------------------------------------------------
    const filtered = useMemo((): Array<VttCue & { originalIdx: number }> => {
        const lower = query.toLowerCase();
        return cues
            .map((c, i) => ({ ...c, originalIdx: i }))
            .filter((c) => !query || c.text.toLowerCase().includes(lower));
    }, [cues, query]);

    // -----------------------------------------------------------------------
    // Find the currently-active cue index (into the `cues` array).
    // -----------------------------------------------------------------------
    const activeCueOriginalIdx = useMemo(() => {
        // Search backwards so the last matching cue wins when cues overlap.
        for (let i = cues.length - 1; i >= 0; i--) {
            const c = cues[i]!;
            if (currentSec >= c.startSec && currentSec < c.endSec) return i;
        }
        return null;
    }, [cues, currentSec]);

    // -----------------------------------------------------------------------
    // Auto-scroll the active row into view.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (activeCueOriginalIdx === null) return;
        // Find the row in the filtered list that matches the active original index.
        const filteredPos = filtered.findIndex((c) => c.originalIdx === activeCueOriginalIdx);
        if (filteredPos === -1) return;
        const el = rowRefs.current[filteredPos];
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeCueOriginalIdx, filtered]);

    // -----------------------------------------------------------------------
    // Seek on row click.
    // -----------------------------------------------------------------------
    const handleCueClick = useCallback((startSec: number, filteredIdx: number) => {
        document.dispatchEvent(new CustomEvent("cassette:seek", { detail: { seconds: startSec } }));

        // Flash the clicked row briefly.
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        setFlashCueIdx(filteredIdx);
        flashTimerRef.current = setTimeout(() => setFlashCueIdx(null), 600);
    }, []);

    useEffect(
        () => () => {
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        },
        [],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (captions.length === 0) {
        return (
            <div className="flex flex-col gap-2 p-2 text-sm text-muted-foreground">
                <p>No transcript available for this video.</p>
                <p className="text-xs">Auto-captions will be available in a future release.</p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-3">
            {/* Language picker */}
            {captions.length > 1 && (
                <div className="flex-shrink-0">
                    <label htmlFor="transcript-lang-select" className="sr-only">
                        Transcript language
                    </label>
                    <select
                        id="transcript-lang-select"
                        value={selectedLang}
                        onChange={(e) => setSelectedLang(e.target.value)}
                        className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        {captions.map((c) => (
                            <option key={c.lang} value={c.lang}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Search input */}
            <div className="flex-shrink-0">
                <input
                    type="search"
                    placeholder="Search transcript..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Search transcript"
                />
            </div>

            {/* Cue list */}
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto rounded-lg"
                role="list"
                aria-label="Transcript"
                aria-live="polite"
                aria-busy={loading}
            >
                {loading && <p className="p-4 text-sm text-muted-foreground">Loading transcript…</p>}

                {!loading && filtered.length === 0 && cues.length > 0 && (
                    <p className="p-4 text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;.</p>
                )}

                {!loading && cues.length === 0 && !loading && (
                    <div className="p-4 text-sm text-muted-foreground">
                        <p>No transcript available for this video.</p>
                        <p className="mt-1 text-xs">Auto-captions will be available in a future release.</p>
                    </div>
                )}

                {filtered.map((cue, filteredIdx) => {
                    const isActive = cue.originalIdx === activeCueOriginalIdx;
                    const isFlashing = filteredIdx === flashCueIdx;

                    return (
                        <button
                            key={cue.originalIdx}
                            ref={(el) => {
                                rowRefs.current[filteredIdx] = el;
                            }}
                            role="listitem"
                            type="button"
                            aria-current={isActive ? "true" : undefined}
                            onClick={() => handleCueClick(cue.startSec, filteredIdx)}
                            className={[
                                "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                                "hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isActive ? "bg-primary/10 text-foreground" : "text-foreground/80",
                                isFlashing ? "bg-primary/20" : "",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <span
                                className={[
                                    "mt-0.5 flex-shrink-0 font-mono text-xs tabular-nums",
                                    isActive ? "font-semibold text-primary" : "text-muted-foreground",
                                ].join(" ")}
                            >
                                {formatMmSs(cue.startSec)}
                            </span>
                            <span className="min-w-0 leading-snug">
                                <HighlightedText text={cue.text} query={query} />
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
