import { mkdir } from "node:fs/promises";

import { runFfmpeg } from "./ffmpeg";
import { type FfprobeStream } from "./probe";

export type ExtractedCaption = {
    streamIndex: number;
    lang: string;
    label: string;
    vttPath: string;
    isDefault: boolean;
};

// Extract every subtitle stream from the source file as WebVTT.
// Returns one entry per stream. Streams without a `language` tag get the
// synthetic lang code "und-<index>" to keep them unique.
export const extractEmbeddedCaptions = async (params: {
    sourcePath: string;
    subtitleStreams: FfprobeStream[];
    captionsDir: string;
}): Promise<ExtractedCaption[]> => {
    const { sourcePath, subtitleStreams, captionsDir } = params;
    if (subtitleStreams.length === 0) return [];

    await mkdir(captionsDir, { recursive: true });

    const results: ExtractedCaption[] = [];

    for (let i = 0; i < subtitleStreams.length; i++) {
        const stream = subtitleStreams[i];
        if (!stream) continue;
        const rawLang: string = (stream.tags?.["language"] ?? `und-${i}`).toLowerCase();
        // Normalise BCP-47: replace underscore with hyphen.
        const lang = rawLang.replace(/_/g, "-");
        const label = stream.tags?.["title"] ?? stream.tags?.["language"] ?? lang;
        const isDefault = (stream.disposition?.["default"] ?? 0) === 1;

        const vttPath = `${captionsDir}/${lang}.vtt`;

        // Map subtitle streams by their absolute stream index.
        await runFfmpeg(["-i", sourcePath, "-map", `0:${stream.index}`, "-c:s", "webvtt", vttPath]);

        results.push({ streamIndex: stream.index, lang, label, vttPath, isDefault });
    }

    return results;
};
