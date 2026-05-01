"use client";

import { useEffect } from "react";

interface DocumentTitleProps {
    /** Fallback title when no video is playing (e.g. "cassette"). */
    title: string;
    /** The playing video title. When provided, overrides `title` with
     *  "${videoTitle} · cassette". */
    videoTitle?: string;
}

/**
 * Updates `document.title` to reflect the playing video while mounted.
 * Restores the previous title on unmount.
 *
 * Rendered in `/watch/[videoId]/page.tsx` so the browser tab surfaces the
 * video title immediately — useful when the user has many tabs open.
 */
export const DocumentTitle = ({ title, videoTitle }: DocumentTitleProps) => {
    useEffect(() => {
        const prev = document.title;
        document.title = videoTitle ? `${videoTitle} · cassette` : title;
        return () => {
            document.title = prev;
        };
    }, [title, videoTitle]);

    return null;
};
