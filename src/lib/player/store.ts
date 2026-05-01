"use client";

import { create } from "zustand";

// Custom event dispatched to the player when the description or an external
// caller wants to seek to a specific timestamp. The player listens for this
// event on the document and calls remote.seek(seconds).
export const SEEK_EVENT = "cassette:seek";

export const dispatchSeek = (seconds: number): void => {
    document.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { seconds } }));
};

// ---------------------------------------------------------------------------
// Player UI store — shared between the watch page and all player sub-components.
// ---------------------------------------------------------------------------

interface PlayerState {
    // Theatre mode: player spans full viewport width; sidebar + comments collapse.
    theatre: boolean;
    // Mini-player: player detaches to a corner card while browsing other pages.
    mini: boolean;

    toggleTheatre: () => void;
    setTheatre: (value: boolean) => void;
    toggleMini: () => void;
    setMini: (value: boolean) => void;
    // Programmatic seek — sets targetSeekSec; the player watches this and seeks
    // when it changes. Set to null after seeking to avoid re-triggering.
    targetSeekSec: number | null;
    seekTo: (seconds: number) => void;
    clearSeek: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
    theatre: false,
    mini: false,
    targetSeekSec: null,

    toggleTheatre: () => set((s) => ({ theatre: !s.theatre })),
    setTheatre: (value) => set({ theatre: value }),
    toggleMini: () => set((s) => ({ mini: !s.mini })),
    setMini: (value) => set({ mini: value }),
    seekTo: (seconds) => set({ targetSeekSec: seconds }),
    clearSeek: () => set({ targetSeekSec: null }),
}));
