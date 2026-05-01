/**
 * Shared timestamp utilities used by DescriptionClient and CommentItem.
 *
 * `parseTimestamp` converts a "H:MM:SS" or "MM:SS" string to seconds.
 * `linkifyTimestamps` walks a plain-text string and returns a React node array
 * with timestamp tokens replaced by clickable buttons that dispatch the
 * `cassette:seek` custom DOM event.
 */

import React from "react";

// Matches timestamps of the form:  1:23  /  12:34  /  1:23:45
const TIMESTAMP_RE = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;

/**
 * Parse a timestamp token into seconds.
 * Returns `null` if the string does not match the expected pattern.
 */
export const parseTimestamp = (token: string): number | null => {
    const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(token.trim());
    if (!m) return null;

    const hours = m[1] !== undefined ? parseInt(m[1], 10) : 0;
    const minutes = parseInt(m[2]!, 10);
    const secs = parseInt(m[3]!, 10);
    return hours * 3600 + minutes * 60 + secs;
};

/**
 * Replace timestamp tokens in `text` with `<button>` elements that dispatch
 * the `cassette:seek` DOM event.
 *
 * `onSeek` is an optional callback invoked *instead of* dispatching the DOM
 * event — useful when the calling component already has a reference to the
 * player remote. When omitted the standard DOM event is dispatched so the
 * player listener in Player.tsx picks it up.
 */
export const linkifyTimestamps = (text: string, onSeek?: (seconds: number) => void): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let pos = 0;
    let key = 0;

    TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = TIMESTAMP_RE.exec(text)) !== null) {
        if (m.index > pos) {
            nodes.push(text.slice(pos, m.index));
        }

        const token = m[0];
        const seconds = parseTimestamp(token)!;

        const handleClick = () => {
            if (onSeek) {
                onSeek(seconds);
            } else {
                document.dispatchEvent(new CustomEvent("cassette:seek", { detail: { seconds } }));
            }
        };

        nodes.push(
            React.createElement(
                "button",
                {
                    key: key++,
                    type: "button",
                    onClick: handleClick,
                    className: "font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors",
                    "aria-label": `Seek to ${token}`,
                },
                token,
            ),
        );

        pos = m.index + token.length;
    }

    if (pos < text.length) {
        nodes.push(text.slice(pos));
    }

    return nodes;
};
