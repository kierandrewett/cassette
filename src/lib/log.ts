// Lightweight structured logger.
//
// We deliberately do not use pino: cassette is a single-tenant self-host app
// and the ergonomics of `console.log` plus a small wrapper are easier on
// operators tailing `docker compose logs`. Output is JSON when
// `LOG_FORMAT=json`, otherwise a colourised one-line format that reads
// naturally in a terminal.
//
// Every line is keyed on `scope` so a grep narrows by component:
//
//   [worker] transcode-video videoId=… ok in 4827ms
//   [upload] accepted videoId=… channelId=… bytes=12345
//
// Pass extra structured fields as a single object; they are flattened into
// `key=value` pairs in pretty mode and merged into the JSON record.

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (): number => {
    const raw = (process.env["LOG_LEVEL"] ?? "info").toLowerCase();
    if (raw in LEVELS) return LEVELS[raw as Level];
    return LEVELS.info;
};

const isJson = (): boolean => process.env["LOG_FORMAT"] === "json";

const COLOURS: Record<Level, string> = {
    debug: "\x1b[90m",
    info: "\x1b[36m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
};
const RESET = "\x1b[0m";

const flatten = (fields: Record<string, unknown>): string =>
    Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => {
            if (v === null) return `${k}=null`;
            if (typeof v === "string") {
                // Quote strings containing whitespace or special chars so a
                // value like `error message` survives a grep | awk pipeline.
                return /[\s"=]/.test(v) ? `${k}=${JSON.stringify(v)}` : `${k}=${v}`;
            }
            if (typeof v === "number" || typeof v === "boolean") return `${k}=${v}`;
            return `${k}=${JSON.stringify(v)}`;
        })
        .join(" ");

const emit = (
    level: Level,
    scope: string,
    msg: string,
    fields?: Record<string, unknown>,
): void => {
    if (LEVELS[level] < envLevel()) return;

    if (isJson()) {
        const record = {
            ts: new Date().toISOString(),
            level,
            scope,
            msg,
            ...(fields ?? {}),
        };
        if (level === "error") {
            console.error(JSON.stringify(record));
        } else if (level === "warn") {
            console.warn(JSON.stringify(record));
        } else {
            console.log(JSON.stringify(record));
        }
        return;
    }

    const ts = new Date().toISOString();
    const colour = COLOURS[level];
    const head = `${ts} ${colour}${level.toUpperCase().padEnd(5)}${RESET} [${scope}]`;
    const tail = fields ? ` ${flatten(fields)}` : "";
    if (level === "error") {
        console.error(`${head} ${msg}${tail}`);
    } else if (level === "warn") {
        console.warn(`${head} ${msg}${tail}`);
    } else {
        console.log(`${head} ${msg}${tail}`);
    }
};

// `logger("scope")` returns a small object bound to the given scope so
// feature code never has to repeat the scope on every line.
export const logger = (scope: string) => ({
    debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", scope, msg, fields),
    info: (msg: string, fields?: Record<string, unknown>) => emit("info", scope, msg, fields),
    warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", scope, msg, fields),
    error: (msg: string, fields?: Record<string, unknown>) => emit("error", scope, msg, fields),
});

export type Logger = ReturnType<typeof logger>;

// Generate a short request id for cross-correlating server logs. Uses
// crypto.getRandomValues when available; falls back to Math.random in dev.
export const requestId = (): string => {
    try {
        const buf = new Uint8Array(8);
        crypto.getRandomValues(buf);
        return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
        return Math.random().toString(36).slice(2, 18);
    }
};
