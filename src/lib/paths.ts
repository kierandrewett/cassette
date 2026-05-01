import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { env } from "@/env";

// Single source of truth for media paths. Feature code should never read
// MEDIA_*_PATH env vars directly; always go through these helpers.

const sourceRoot = resolve(env.MEDIA_SOURCE_PATH);
const hlsRoot = resolve(env.MEDIA_HLS_PATH);

export const sourcePathForChannel = (channelHandle: string): string => join(sourceRoot, channelHandle);

export const sourcePathForVideo = (channelHandle: string, videoId: string, ext: string): string =>
    join(sourceRoot, channelHandle, `${videoId}${ext.startsWith(".") ? ext : `.${ext}`}`);

export const sourceCaptionsDir = (channelHandle: string, videoId: string): string =>
    join(sourceRoot, channelHandle, `${videoId}.captions`);

export const hlsDir = (videoId: string): string => join(hlsRoot, videoId);

export const hlsMasterPath = (videoId: string): string => join(hlsRoot, videoId, "master.m3u8");

export const hlsVariantPlaylistPath = (videoId: string, rung: string): string =>
    join(hlsRoot, videoId, rung, "playlist.m3u8");

export const hlsSegmentPath = (videoId: string, rung: string, segment: string): string =>
    join(hlsRoot, videoId, rung, segment);

export const hlsCaptionsPath = (videoId: string, lang: string): string =>
    join(hlsRoot, videoId, "captions", `${lang}.vtt`);

export const hlsThumbnailPath = (videoId: string): string => join(hlsRoot, videoId, "thumbnail.jpg");

export const hlsSpriteJpgPath = (videoId: string): string => join(hlsRoot, videoId, "sprite.jpg");

export const hlsSpriteVttPath = (videoId: string): string => join(hlsRoot, videoId, "sprite.vtt");

// Channel asset helpers — avatar and banner images stored under _assets/<channelId>/
// Paths are relative to hlsRoot when stored in the DB; absolute on disk.

export const channelAssetsDir = (channelId: string): string => join(hlsRoot, "_assets", channelId);

/** Absolute on-disk path for a channel asset file. */
export const channelAssetPath = (channelId: string, kind: "avatar" | "banner", ext: string): string =>
    join(hlsRoot, "_assets", channelId, `${kind}${ext.startsWith(".") ? ext : `.${ext}`}`);

/** Relative path stored in the DB (relative to hlsRoot). */
export const channelAssetRelative = (channelId: string, kind: "avatar" | "banner", ext: string): string =>
    join("_assets", channelId, `${kind}${ext.startsWith(".") ? ext : `.${ext}`}`);

export const ensureDir = async (dir: string): Promise<void> => {
    await mkdir(dir, { recursive: true });
};

export const paths = {
    sourceRoot,
    hlsRoot,
} as const;
