// Pure functions that read HLS playlists from disk and rewrite relative URIs
// to absolute /api/hls/... paths, optionally appending access credentials.
//
// "Idempotent" means calling these functions a second time on already-rewritten
// output produces the same result (because the absolute path pattern is
// recognised and left alone).

import { readFile } from "node:fs/promises";

import { hlsMasterPath, hlsVariantPlaylistPath } from "@/lib/paths";

// Tokens/slugs that callers embed for unlisted/private videos.
export type PlaylistCredential =
    | { kind: "none" }
    | { kind: "slug"; slug: string }
    | { kind: "token"; token: string }
    | { kind: "slug-and-token"; slug: string; token: string };

// Produce the query string for a given credential (empty string for none).
export const credentialQueryString = (credential: PlaylistCredential): string => {
    if (credential.kind === "none") return "";
    if (credential.kind === "token") return `?t=${encodeURIComponent(credential.token)}`;
    if (credential.kind === "slug") return `?slug=${encodeURIComponent(credential.slug)}`;
    // slug-and-token
    return `?slug=${encodeURIComponent(credential.slug)}&t=${encodeURIComponent(credential.token)}`;
};

/**
 * Read the master playlist for `videoId` from disk and rewrite every variant
 * playlist URI from a relative path to `/api/hls/<videoId>/<rung>/playlist.m3u8`
 * with any required credential query string appended.
 *
 * Idempotent: lines already starting with `/api/hls/` are left unchanged.
 */
export const rewriteMasterPlaylist = async (videoId: string, credential: PlaylistCredential): Promise<string> => {
    const raw = await readFile(hlsMasterPath(videoId), "utf8");
    const qs = credentialQueryString(credential);
    const lines = raw.split("\n");
    const out: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip blanks and directives.
        if (trimmed.length === 0 || trimmed.startsWith("#")) {
            out.push(line);
            continue;
        }

        // Already an absolute /api/hls/ URI — idempotent pass-through.
        if (trimmed.startsWith("/api/hls/")) {
            out.push(line);
            continue;
        }

        // Variant playlist reference: relative path ending in .m3u8
        if (trimmed.endsWith(".m3u8")) {
            // The rung is the leading directory: `360p/playlist.m3u8` -> `360p`.
            const slash = trimmed.indexOf("/");
            const rung = slash !== -1 ? trimmed.slice(0, slash) : trimmed.replace(".m3u8", "");
            out.push(`/api/hls/${videoId}/${rung}/playlist.m3u8${qs}`);
            continue;
        }

        // Unknown non-directive line — leave it alone.
        out.push(line);
    }

    return out.join("\n");
};

/**
 * Read a variant playlist for `videoId`/`rung` from disk and rewrite every
 * segment URI from a relative path to `/api/hls/<videoId>/<rung>/<seg>.ts`
 * with any required credential query string appended.
 *
 * Idempotent: lines already starting with `/api/hls/` are left unchanged.
 */
export const rewriteVariantPlaylist = async (
    videoId: string,
    rung: string,
    credential: PlaylistCredential,
): Promise<string> => {
    const raw = await readFile(hlsVariantPlaylistPath(videoId, rung), "utf8");
    const qs = credentialQueryString(credential);
    const lines = raw.split("\n");
    const out: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip blanks and directives.
        if (trimmed.length === 0 || trimmed.startsWith("#")) {
            out.push(line);
            continue;
        }

        // Already an absolute /api/hls/ URI — idempotent pass-through.
        if (trimmed.startsWith("/api/hls/")) {
            out.push(line);
            continue;
        }

        // Segment reference: relative .ts filename.
        if (trimmed.endsWith(".ts")) {
            out.push(`/api/hls/${videoId}/${rung}/${trimmed}${qs}`);
            continue;
        }

        // Unknown non-directive line — leave it alone.
        out.push(line);
    }

    return out.join("\n");
};
