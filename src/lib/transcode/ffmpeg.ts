import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ------------------------------------------------------------------
// Progress parsing
// ------------------------------------------------------------------

// ffmpeg reports progress to stderr with lines like:
//   out_time_ms=12345678
//   progress=continue   (or "end")
//
// We parse these to derive a 0–1 fraction of `totalDurationMs`.

export type ProgressCallback = (fraction: number) => void;

const parseOutTimeMs = (line: string): number | null => {
    const match = /^out_time_ms=(\d+)/.exec(line.trim());
    if (!match || !match[1]) return null;
    return parseInt(match[1], 10);
};

// ------------------------------------------------------------------
// Encoder detection
// ------------------------------------------------------------------

let cachedEncoders: Set<string> | null = null;

const loadEncoders = async (): Promise<Set<string>> => {
    if (cachedEncoders !== null) return cachedEncoders;
    try {
        const { stdout } = await execFileAsync("ffmpeg", ["-hide_banner", "-encoders"]);
        const set = new Set<string>();
        for (const line of stdout.split("\n")) {
            // Encoder lines start with " V....D " or similar; the second
            // whitespace-separated token is the encoder name.
            const match = /^\s*[VAS][.\w]*\s+(\S+)/.exec(line);
            if (match && match[1]) set.add(match[1]);
        }
        cachedEncoders = set;
    } catch {
        cachedEncoders = new Set();
    }
    return cachedEncoders;
};

export const isNvencAvailable = async (): Promise<boolean> => {
    const encoders = await loadEncoders();
    return encoders.has("h264_nvenc");
};

export type H264Encoder = "h264_nvenc" | "libx264" | "libopenh264";

// Resolve the preferred H.264 encoder available on the running ffmpeg.
// Order: NVENC (if requested by env) > libx264 > libopenh264. We fall back
// to libopenh264 specifically because Fedora's ffmpeg-free build excludes
// libx264 for licensing reasons; the bundled debian image used by the
// production runner has libx264 available, but operators running against
// the host ffmpeg need a sensible fallback so they can dogfood locally.
export const resolveH264Encoder = async (preferNvenc = false): Promise<H264Encoder> => {
    const encoders = await loadEncoders();
    if (preferNvenc && encoders.has("h264_nvenc")) return "h264_nvenc";
    if (encoders.has("libx264")) return "libx264";
    if (encoders.has("libopenh264")) return "libopenh264";
    throw new FfmpegError("no usable H.264 encoder found (looked for h264_nvenc, libx264, libopenh264)", "");
};

// Per-encoder argument profiles. Bitrate / preset / quality knobs differ
// enough that callers should branch on the resolved encoder.
export const encoderArgs = (encoder: H264Encoder, bitrateKbps: number): string[] => {
    switch (encoder) {
        case "libx264":
            return [
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-profile:v",
                "high",
                "-level",
                "4.1",
                "-b:v",
                `${bitrateKbps}k`,
                "-maxrate",
                `${Math.floor(bitrateKbps * 1.07)}k`,
                "-bufsize",
                `${bitrateKbps * 2}k`,
            ];
        case "h264_nvenc":
            return [
                "-c:v",
                "h264_nvenc",
                "-preset",
                "p4",
                "-tune",
                "hq",
                "-rc",
                "vbr",
                "-cq",
                "21",
                "-b:v",
                `${bitrateKbps}k`,
                "-maxrate",
                `${Math.floor(bitrateKbps * 1.07)}k`,
            ];
        case "libopenh264":
            // libopenh264 has a smaller knob surface; quality is best-effort.
            return ["-c:v", "libopenh264", "-b:v", `${bitrateKbps}k`];
    }
};

// ------------------------------------------------------------------
// Main spawn helper
// ------------------------------------------------------------------

export type SpawnFfmpegOptions = {
    args: string[];
    /** Total duration in seconds for progress fraction calculation. */
    durationSec?: number;
    onProgress?: ProgressCallback;
};

// Spawn ffmpeg with the given args, stream progress events via `onProgress`,
// collect stderr for error reporting, and resolve/reject on exit.
export const spawnFfmpeg = (options: SpawnFfmpegOptions): Promise<void> =>
    new Promise((resolve, reject) => {
        const { args, durationSec, onProgress } = options;
        const totalMs = (durationSec ?? 0) * 1000;

        // `-progress pipe:2` writes progress key=value pairs to stderr.
        // We also pass `-stats_period 2` to throttle output.
        const finalArgs = ["-progress", "pipe:2", "-stats_period", "2", ...args];

        const child = spawn("ffmpeg", finalArgs, { stdio: ["ignore", "ignore", "pipe"] });

        const stderrLines: string[] = [];
        let stderrBuf = "";

        child.stderr?.on("data", (chunk: Buffer) => {
            stderrBuf += chunk.toString("utf8");
            const lines = stderrBuf.split("\n");
            // Keep incomplete last line in the buffer.
            stderrBuf = lines.pop() ?? "";

            for (const line of lines) {
                stderrLines.push(line);
                // Keep only the last 4 KB worth of lines.
                while (stderrLines.join("\n").length > 4096) {
                    stderrLines.shift();
                }

                if (onProgress && totalMs > 0) {
                    const outTimeMs = parseOutTimeMs(line);
                    if (outTimeMs !== null) {
                        const fraction = Math.min(1, outTimeMs / totalMs);
                        onProgress(fraction);
                    }
                }
            }
        });

        child.on("error", reject);

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                const stderr = [...stderrLines, stderrBuf].join("\n").slice(-4096);
                reject(new FfmpegError(`ffmpeg exited with code ${code}`, stderr));
            }
        });
    });

export class FfmpegError extends Error {
    readonly stderr: string;
    constructor(message: string, stderr: string) {
        super(message);
        this.name = "FfmpegError";
        this.stderr = stderr;
    }
}

// ------------------------------------------------------------------
// Simple one-shot wrapper for thumbnail / sprite / caption extraction
// (no progress needed, short operations).
// ------------------------------------------------------------------

export const runFfmpeg = async (args: string[]): Promise<{ stderr: string }> => {
    return new Promise((resolve, reject) => {
        const child = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf8");
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve({ stderr });
            } else {
                reject(new FfmpegError(`ffmpeg exited with code ${code}`, stderr.slice(-4096)));
            }
        });
    });
};
