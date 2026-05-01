"use client";

import { useEffect, useState } from "react";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface Shortcut {
    keys: string[];
    description: string;
}

interface ShortcutGroup {
    category: string;
    shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        category: "Playback",
        shortcuts: [
            { keys: ["Space", "K"], description: "Play / Pause" },
            { keys: [">"], description: "Increase speed by 0.25×" },
            { keys: ["<"], description: "Decrease speed by 0.25×" },
            { keys: ["T"], description: "Toggle theatre mode" },
            { keys: ["F"], description: "Toggle fullscreen" },
            { keys: ["I"], description: "Toggle picture-in-picture" },
        ],
    },
    {
        category: "Seeking",
        shortcuts: [
            { keys: ["J"], description: "Seek back 10 seconds" },
            { keys: ["L"], description: "Seek forward 10 seconds" },
            { keys: ["←"], description: "Seek back 5 seconds" },
            { keys: ["→"], description: "Seek forward 5 seconds" },
            { keys: ["0 – 9"], description: "Seek to N × 10% of video" },
        ],
    },
    {
        category: "Volume",
        shortcuts: [
            { keys: ["M"], description: "Mute / Unmute" },
            { keys: ["↑"], description: "Increase volume by 10%" },
            { keys: ["↓"], description: "Decrease volume by 10%" },
        ],
    },
    {
        category: "Captions",
        shortcuts: [
            { keys: ["C"], description: "Toggle captions" },
        ],
    },
    {
        category: "Help",
        shortcuts: [
            { keys: ["?"], description: "Show / hide keyboard shortcuts" },
        ],
    },
];

/**
 * Keyboard shortcuts help dialog.
 *
 * Opens when the user presses `?` (Shift+/) while focus is not on an input.
 * The open state is local — no prop drilling required. The player's key
 * handler explicitly opens/closes this via the exported `useShortcutsOverlay`
 * hook.
 */
export const useShortcutsOverlay = () => {
    const [open, setOpen] = useState(false);
    const toggle = () => setOpen((v) => !v);
    return { open, setOpen, toggle };
};

interface KeyboardShortcutsOverlayProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const KeyboardShortcutsOverlay = ({ open, onOpenChange }: KeyboardShortcutsOverlayProps) => {
    // Also allow closing with Escape (Dialog already handles this, but we keep
    // the hook here for potential future programmatic close).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
                onOpenChange(false);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Keyboard shortcuts</DialogTitle>
                </DialogHeader>

                <div className="mt-2 space-y-5">
                    {SHORTCUT_GROUPS.map((group) => (
                        <div key={group.category}>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {group.category}
                            </p>
                            <ul className="space-y-1.5">
                                {group.shortcuts.map((s) => (
                                    <li
                                        key={s.description}
                                        className="flex items-center justify-between gap-4 text-sm"
                                    >
                                        <span className="text-foreground/80">{s.description}</span>
                                        <span className="flex shrink-0 items-center gap-1">
                                            {s.keys.map((k) => (
                                                <kbd
                                                    key={k}
                                                    className="inline-flex items-center rounded border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium text-foreground/70 shadow-sm"
                                                >
                                                    {k}
                                                </kbd>
                                            ))}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
};
