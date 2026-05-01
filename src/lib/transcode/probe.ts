import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ------------------------------------------------------------------
// ffprobe output types
// ------------------------------------------------------------------

export type FfprobeStream = {
    index: number;
    codec_type: "video" | "audio" | "subtitle" | "data" | "attachment";
    codec_name: string;
    codec_long_name?: string;
    profile?: string;
    width?: number;
    height?: number;
    coded_width?: number;
    coded_height?: number;
    r_frame_rate?: string; // e.g. "30/1"
    avg_frame_rate?: string;
    display_aspect_ratio?: string;
    pix_fmt?: string;
    level?: number;
    color_space?: string;
    color_transfer?: string;
    color_primaries?: string;
    channels?: number;
    channel_layout?: string;
    sample_rate?: string;
    sample_fmt?: string;
    bit_rate?: string;
    nb_frames?: string;
    tags?: Record<string, string>;
    disposition?: Record<string, number>;
};

export type FfprobeFormat = {
    filename: string;
    nb_streams: number;
    nb_programs: number;
    format_name: string;
    format_long_name: string;
    start_time: string;
    duration: string; // seconds as string, e.g. "123.456"
    size: string;
    bit_rate: string;
    probe_score: number;
    tags?: Record<string, string>;
};

export type FfprobeChapter = {
    id: number;
    time_base: string;
    start: number;
    start_time: string;
    end: number;
    end_time: string;
    tags?: Record<string, string>;
};

export type FfprobeResult = {
    streams: FfprobeStream[];
    format: FfprobeFormat;
    chapters: FfprobeChapter[];
};

// Derived, convenient view of probe results used across the pipeline.
export type ProbeMetadata = {
    raw: FfprobeResult;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    videoCodec: string;
    audioCodec: string | null;
    videoStream: FfprobeStream;
    audioStream: FfprobeStream | null;
    subtitleStreams: FfprobeStream[];
    chapters: FfprobeChapter[];
};

// Run ffprobe against `sourcePath` and return typed results.
// Throws with a clear message if no video stream is found.
export const probe = async (sourcePath: string): Promise<ProbeMetadata> => {
    const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-show_chapters",
        "-of",
        "json",
        sourcePath,
    ]);

    const raw = JSON.parse(stdout) as FfprobeResult;
    if (!raw.streams) raw.streams = [];
    if (!raw.chapters) raw.chapters = [];

    const videoStream = raw.streams.find((s) => s.codec_type === "video");
    if (!videoStream) {
        throw new Error("no video stream found in source file");
    }

    const audioStream = raw.streams.find((s) => s.codec_type === "audio") ?? null;
    const subtitleStreams = raw.streams.filter((s) => s.codec_type === "subtitle");

    const durationSec = parseFloat(raw.format.duration ?? "0");

    const width = videoStream.width ?? videoStream.coded_width ?? 0;
    const height = videoStream.height ?? videoStream.coded_height ?? 0;

    // Parse r_frame_rate (e.g. "30/1", "25/1", "30000/1001").
    const fps = parseFraction(videoStream.r_frame_rate ?? videoStream.avg_frame_rate ?? "0/1");

    return {
        raw,
        durationSec,
        width,
        height,
        fps,
        videoCodec: videoStream.codec_name,
        audioCodec: audioStream?.codec_name ?? null,
        videoStream,
        audioStream,
        subtitleStreams,
        chapters: raw.chapters,
    };
};

const parseFraction = (frac: string): number => {
    const parts = frac.split("/").map(Number);
    const num = parts[0] ?? 0;
    const den = parts[1];
    if (!den || den === 0) return num;
    return num / den;
};
