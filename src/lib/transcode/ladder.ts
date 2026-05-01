// ABR ladder definition and rung filtering.
//
// Rung names map to the `video_variant_rung` enum in the DB schema.
// Heights match the enum values: "360p" | "480p" | "720p" | "1080p".

export type RungName = "360p" | "480p" | "720p" | "1080p";

export type Rung = {
    name: RungName;
    height: number;
    width: number;
    videoBitrate: string; // ffmpeg -b:v value, e.g. "5000k"
    maxBitrate: string; // ffmpeg -maxrate value
    bufSize: string; // ffmpeg -bufsize value
    audioBitrate: string; // ffmpeg -b:a value, e.g. "192k"
    /** Peak bandwidth in bps for HLS EXT-X-STREAM-INF BANDWIDTH. */
    bandwidth: number;
    /** Codec string for HLS EXT-X-STREAM-INF CODECS. */
    codecs: string;
};

// Full ladder, ordered from highest to lowest quality.
// Width values follow standard DAR 16:9; ffmpeg will letterbox/pillarbox for
// sources with different aspect ratios via force_original_aspect_ratio=decrease.
export const FULL_LADDER: readonly Rung[] = [
    {
        name: "1080p",
        height: 1080,
        width: 1920,
        videoBitrate: "5000k",
        maxBitrate: "5350k",
        bufSize: "7500k",
        audioBitrate: "192k",
        bandwidth: 5_350_000 + 192_000, // peak video + audio
        codecs: "avc1.640028,mp4a.40.2",
    },
    {
        name: "720p",
        height: 720,
        width: 1280,
        videoBitrate: "2800k",
        maxBitrate: "2996k",
        bufSize: "4200k",
        audioBitrate: "160k",
        bandwidth: 2_996_000 + 160_000,
        codecs: "avc1.64001f,mp4a.40.2",
    },
    {
        name: "480p",
        height: 480,
        width: 854,
        videoBitrate: "1400k",
        maxBitrate: "1498k",
        bufSize: "2100k",
        audioBitrate: "128k",
        bandwidth: 1_498_000 + 128_000,
        codecs: "avc1.4d401e,mp4a.40.2",
    },
    {
        name: "360p",
        height: 360,
        width: 640,
        videoBitrate: "800k",
        maxBitrate: "856k",
        bufSize: "1200k",
        audioBitrate: "96k",
        bandwidth: 856_000 + 96_000,
        codecs: "avc1.4d401e,mp4a.40.2",
    },
] as const;

// Return the subset of the full ladder that is at or below the source height.
// Always includes at least the lowest rung so we always produce something.
export const buildLadder = (sourceHeight: number): Rung[] => {
    const eligible = FULL_LADDER.filter((r) => r.height <= sourceHeight);
    if (eligible.length === 0) {
        // Source is shorter than 360p — produce only the 360p rung (will upscale
        // slightly, but gives the pipeline a consistent output shape).
        return [FULL_LADDER[FULL_LADDER.length - 1] as Rung];
    }
    return [...eligible];
};
