import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Minimal .env loader for build-time tools (drizzle-kit, scripts) that run
// outside of Next.js's runtime env-injection. Next.js itself loads .env in
// dev/build, so this is only needed for tooling.
export const config = (): void => {
    const envPath = resolve(process.cwd(), ".env");
    let raw: string;
    try {
        raw = readFileSync(envPath, "utf8");
    } catch {
        return;
    }
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
};
