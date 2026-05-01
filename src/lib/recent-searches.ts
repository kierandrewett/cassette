// Persistent "recent searches" helper backed by localStorage.
// Used by the top-bar search popover to surface the user's last 5 queries
// when the input is focused but empty. Kept in lib/ so it's free of React.

const STORAGE_KEY = "cassette.recentSearches";
const MAX_ENTRIES = 5;

export const readRecentSearches = (): string[] => {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_ENTRIES);
    } catch {
        return [];
    }
};

const writeRecentSearches = (items: string[]): void => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)));
    } catch {
        // Quota / private mode — ignore.
    }
};

/** Push a new query onto the front of the list, deduping case-insensitively. */
export const pushRecentSearch = (query: string): string[] => {
    const trimmed = query.trim();
    if (!trimmed) return readRecentSearches();
    const existing = readRecentSearches();
    const lower = trimmed.toLowerCase();
    const filtered = existing.filter((q) => q.toLowerCase() !== lower);
    const next = [trimmed, ...filtered].slice(0, MAX_ENTRIES);
    writeRecentSearches(next);
    return next;
};

/** Drop a single query from the list. Returns the new list. */
export const removeRecentSearch = (query: string): string[] => {
    const next = readRecentSearches().filter((q) => q !== query);
    writeRecentSearches(next);
    return next;
};

/** Wipe the entire list. */
export const clearRecentSearches = (): string[] => {
    writeRecentSearches([]);
    return [];
};
