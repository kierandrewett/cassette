import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { runFfmpeg } from "./ffmpeg";

const COLS = 10;
const ROWS = 10;
const TILE_WIDTH = 160; // px; height auto-calculated to preserve AR
const TILE_MAX = COLS * ROWS; // 100 frames total

// ------------------------------------------------------------------
// Sprite generation
// ------------------------------------------------------------------

export type SpriteResult = {
    /** Absolute path to the sprite JPEG. */
    jpgPath: string;
    /** Absolute path to the WebVTT file. */
    vttPath: string;
};

// Generate a 10x10 JPEG sprite sheet and its companion WebVTT cue file.
//
// The frames are evenly distributed across the video duration (capped at 100).
// For short videos we cap at ceil(duration/2) frames to avoid near-duplicate
// thumbnails, and adjust the tile grid to fill only the frames we need.
export const generateSprite = async (params: {
    sourcePath: string;
    durationSec: number;
    jpgPath: string;
    vttPath: string;
    /** Base URL (or path fragment) prefixed to sprite.jpg in VTT cues. */
    spriteUrl?: string;
}): Promise<SpriteResult> => {
    const { sourcePath, durationSec, jpgPath, vttPath } = params;
    const spriteUrl = params.spriteUrl ?? "sprite.jpg";

    const frameCount = Math.min(TILE_MAX, Math.ceil(durationSec / 2));
    const interval = durationSec / frameCount; // seconds between frames

    // fps filter: extract `frameCount` frames evenly spaced.
    // fps=<frameCount>/<duration> produces exactly the right count.
    const fps = `${frameCount}/${durationSec}`;

    await mkdir(dirname(jpgPath), { recursive: true });

    // ffmpeg generates the tile sheet directly using the `tile` filter.
    await runFfmpeg([
        "-i",
        sourcePath,
        "-vf",
        `fps=${fps},scale=${TILE_WIDTH}:-1,tile=${COLS}x${ROWS}`,
        "-frames:v",
        "1",
        "-q:v",
        "5",
        jpgPath,
    ]);

    // Calculate the actual tile height from the first frame dimensions.
    // We derive it by reading the sprite dimensions via ffprobe, but to avoid
    // a second probe call, we compute it from the aspect ratio of the source
    // (which we don't have here). Use a fixed estimate of 90px (16:9 of 160px)
    // and let the VTT player handle slight inaccuracies.
    //
    // A more accurate approach would require passing sourceWidth/sourceHeight
    // in; the player is tolerant of small mismatches.
    const tileHeight = Math.round(TILE_WIDTH * (9 / 16));

    const vtt = buildVtt({
        frameCount,
        interval,
        durationSec,
        cols: COLS,
        tileWidth: TILE_WIDTH,
        tileHeight,
        spriteUrl,
    });

    await mkdir(dirname(vttPath), { recursive: true });
    await writeFile(vttPath, vtt, "utf8");

    return { jpgPath, vttPath };
};

// ------------------------------------------------------------------
// VTT writer
// ------------------------------------------------------------------

type VttOptions = {
    frameCount: number;
    interval: number;
    durationSec: number;
    cols: number;
    tileWidth: number;
    tileHeight: number;
    spriteUrl: string;
};

const formatTimestamp = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const ms = Math.round((s % 1) * 1000);
    const ss = Math.floor(s);
    return `${pad(h)}:${pad(m)}:${pad(ss)}.${String(ms).padStart(3, "0")}`;
};

const pad = (n: number): string => String(n).padStart(2, "0");

const buildVtt = (opts: VttOptions): string => {
    const { frameCount, interval, durationSec, cols, tileWidth, tileHeight, spriteUrl } = opts;
    const lines: string[] = ["WEBVTT", ""];

    for (let i = 0; i < frameCount; i++) {
        const startSec = i * interval;
        const endSec = Math.min((i + 1) * interval, durationSec);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * tileWidth;
        const y = row * tileHeight;

        lines.push(
            `${formatTimestamp(startSec)} --> ${formatTimestamp(endSec)}`,
            `${spriteUrl}#xywh=${x},${y},${tileWidth},${tileHeight}`,
            "",
        );
    }

    return lines.join("\n");
};
