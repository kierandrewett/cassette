/**
 * Player preferences persisted to localStorage under `cassette.player.*`.
 *
 * Defensive throughout: all reads return safe defaults when localStorage is
 * unavailable (SSR, Safari private browsing, storage quota exceeded).
 * Writes are debounced at 250 ms so dragging the volume slider does not
 * hammer storage.
 */

const NS = "cassette.player";

export interface PlayerPreferences {
    volume: number;
    playbackRate: number;
    captionsLang: string | null;
    theatre: boolean;
    hoverPreviewsEnabled: boolean;
    lastSleepTimer: SleepTimerOption;
    statsOverlayEnabled: boolean;
}

export type SleepTimerOption = "off" | "5" | "15" | "30" | "60" | "end";

const VALID_SLEEP_OPTIONS: SleepTimerOption[] = ["off", "5", "15", "30", "60", "end"];

const DEFAULTS: PlayerPreferences = {
    volume: 1,
    playbackRate: 1,
    captionsLang: null,
    theatre: false,
    hoverPreviewsEnabled: true,
    lastSleepTimer: "off",
    statsOverlayEnabled: false,
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const safeGet = (key: string): string | null => {
    try {
        return localStorage.getItem(`${NS}.${key}`);
    } catch {
        return null;
    }
};

const safeSet = (key: string, value: string): void => {
    try {
        localStorage.setItem(`${NS}.${key}`, value);
    } catch {
        // Quota exceeded or private-mode restriction — silently ignore.
    }
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const readPreferences = (): PlayerPreferences => {
    const volumeRaw = safeGet("volume");
    const rateRaw = safeGet("playbackRate");
    const captionsRaw = safeGet("captionsLang");
    const theatreRaw = safeGet("theatre");
    const hoverPreviewsRaw = safeGet("hoverPreviewsEnabled");
    const sleepTimerRaw = safeGet("lastSleepTimer");
    const statsRaw = safeGet("statsOverlayEnabled");

    const volume = volumeRaw !== null ? Math.max(0, Math.min(1, Number(volumeRaw))) : DEFAULTS.volume;
    const playbackRate = rateRaw !== null ? Math.max(0.25, Math.min(2, Number(rateRaw))) : DEFAULTS.playbackRate;
    const captionsLang = captionsRaw === "" || captionsRaw === null ? null : captionsRaw;
    const theatre = theatreRaw === "true";
    // Default true unless explicitly stored as "false".
    const hoverPreviewsEnabled = hoverPreviewsRaw === "false" ? false : DEFAULTS.hoverPreviewsEnabled;
    const lastSleepTimer: SleepTimerOption =
        sleepTimerRaw !== null && VALID_SLEEP_OPTIONS.includes(sleepTimerRaw as SleepTimerOption)
            ? (sleepTimerRaw as SleepTimerOption)
            : DEFAULTS.lastSleepTimer;
    const statsOverlayEnabled = statsRaw === "true";

    return {
        volume: isNaN(volume) ? DEFAULTS.volume : volume,
        playbackRate: isNaN(playbackRate) ? DEFAULTS.playbackRate : playbackRate,
        captionsLang,
        theatre,
        hoverPreviewsEnabled,
        lastSleepTimer,
        statsOverlayEnabled,
    };
};

// ---------------------------------------------------------------------------
// Debounced write helpers
// ---------------------------------------------------------------------------

const timers: Record<string, ReturnType<typeof setTimeout>> = {};

const debouncedSet = (key: string, value: string, delayMs = 250): void => {
    const existing = timers[key];
    if (existing !== undefined) clearTimeout(existing);
    timers[key] = setTimeout(() => {
        safeSet(key, value);
        delete timers[key];
    }, delayMs);
};

export const writeVolume = (volume: number): void => {
    debouncedSet("volume", String(Math.max(0, Math.min(1, volume))));
};

export const writePlaybackRate = (rate: number): void => {
    debouncedSet("playbackRate", String(Math.max(0.25, Math.min(2, rate))));
};

export const writeCaptionsLang = (lang: string | null): void => {
    // Captions changes are intentional — write immediately, no debounce needed.
    safeSet("captionsLang", lang ?? "");
};

export const writeTheatre = (value: boolean): void => {
    safeSet("theatre", String(value));
};

export const writeHoverPreviewsEnabled = (value: boolean): void => {
    safeSet("hoverPreviewsEnabled", String(value));
};

export const writeLastSleepTimer = (option: SleepTimerOption): void => {
    safeSet("lastSleepTimer", option);
};

export const writeStatsOverlayEnabled = (value: boolean): void => {
    safeSet("statsOverlayEnabled", String(value));
};
