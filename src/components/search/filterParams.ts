// Serialisation helpers for search filter URL parameters.
// Used by SearchFilters (client) and the search page (server RSC).
// Kept pure so Vitest can exercise it without a browser or Next.js runtime.

export type UploadedWithin = "hour" | "today" | "week" | "month" | "year";
export type Duration = "short" | "medium" | "long";
export type SearchType = "video" | "channel" | "playlist";

export interface SearchFilters {
    q: string;
    uploadedWithin?: UploadedWithin;
    duration?: Duration;
    hasCaptions?: boolean;
    type?: SearchType;
    tag?: string;
}

const UPLOADED_WITHIN_VALUES: UploadedWithin[] = ["hour", "today", "week", "month", "year"];
const DURATION_VALUES: Duration[] = ["short", "medium", "long"];
const TYPE_VALUES: SearchType[] = ["video", "channel", "playlist"];
const TAG_RE = /^[a-z0-9-]+$/;

/** Parse a URLSearchParams (or plain object) into a typed SearchFilters. */
export const parseSearchFilters = (params: URLSearchParams | Record<string, string>): SearchFilters => {
    const get = (key: string): string | null =>
        params instanceof URLSearchParams ? params.get(key) : (params[key] ?? null);

    const q = get("q") ?? "";

    const rawUploadedWithin = get("uploadedWithin");
    const uploadedWithin: UploadedWithin | undefined =
        rawUploadedWithin && (UPLOADED_WITHIN_VALUES as string[]).includes(rawUploadedWithin)
            ? (rawUploadedWithin as UploadedWithin)
            : undefined;

    const rawDuration = get("duration");
    const duration: Duration | undefined =
        rawDuration && (DURATION_VALUES as string[]).includes(rawDuration)
            ? (rawDuration as Duration)
            : undefined;

    const rawHasCaptions = get("hasCaptions");
    const hasCaptions: boolean | undefined =
        rawHasCaptions === "true" ? true : rawHasCaptions === "false" ? false : undefined;

    const rawType = get("type");
    const type: SearchType | undefined =
        rawType && (TYPE_VALUES as string[]).includes(rawType) ? (rawType as SearchType) : undefined;

    const rawTag = get("tag");
    const tag: string | undefined =
        rawTag && TAG_RE.test(rawTag) && rawTag.length <= 30 ? rawTag : undefined;

    return { q, uploadedWithin, duration, hasCaptions, type, tag };
};

/** Serialise a SearchFilters back into a URLSearchParams string. */
export const serialiseSearchFilters = (filters: SearchFilters): string => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.uploadedWithin) params.set("uploadedWithin", filters.uploadedWithin);
    if (filters.duration) params.set("duration", filters.duration);
    if (filters.hasCaptions !== undefined) params.set("hasCaptions", String(filters.hasCaptions));
    if (filters.type) params.set("type", filters.type);
    if (filters.tag) params.set("tag", filters.tag);
    return params.toString();
};

/** Produce a URL for the search page with one filter mutated. */
export const mutateFilter = (
    current: SearchFilters,
    patch: Partial<Omit<SearchFilters, "q">>,
): string => {
    const next: SearchFilters = { ...current, ...patch };
    const qs = serialiseSearchFilters(next);
    return `/search${qs ? `?${qs}` : ""}`;
};
