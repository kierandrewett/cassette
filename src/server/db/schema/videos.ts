import { sql } from "drizzle-orm";
import {
    bigint,
    boolean,
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

import { tsvector } from "./_types";
import { user } from "./auth";
import { channels } from "./channels";

export const videoPrivacy = pgEnum("video_privacy", ["public", "unlisted", "private"]);
export const videoStatus = pgEnum("video_status", ["queued", "transcoding", "ready", "failed"]);
export const videoVariantRung = pgEnum("video_variant_rung", ["360p", "480p", "720p", "1080p"]);
export const captionSource = pgEnum("caption_source", ["embedded", "sidecar"]);
export const chapterSource = pgEnum("chapter_source", ["description", "container"]);

export const videos = pgTable(
    "videos",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        channelId: uuid("channel_id")
            .notNull()
            .references(() => channels.id, { onDelete: "cascade" }),
        // uploader can outlive a deleted user, but the FK lets us null it out.
        uploaderId: text("uploader_id").references(() => user.id, { onDelete: "set null" }),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        privacy: videoPrivacy("privacy").notNull().default("public"),
        unlistedSlug: text("unlisted_slug"),
        status: videoStatus("status").notNull().default("queued"),
        // Path is stored relative to MEDIA_SOURCE_PATH so the bind-mount can move.
        sourcePath: text("source_path").notNull(),
        // hlsDir is relative to MEDIA_HLS_PATH and is set after a successful
        // transcode.
        hlsDir: text("hls_dir"),
        durationSec: integer("duration_sec"),
        width: integer("width"),
        height: integer("height"),
        fps: numeric("fps", { precision: 6, scale: 3 }),
        videoCodec: text("video_codec"),
        audioCodec: text("audio_codec"),
        thumbnailPath: text("thumbnail_path"),
        spriteJpgPath: text("sprite_jpg_path"),
        spriteVttPath: text("sprite_vtt_path"),
        sourceBytes: bigint("source_bytes", { mode: "number" }),
        sourceSha256: text("source_sha256"),
        // tags are free-form strings the uploader can attach. GIN-indexed
        // so searches can use the array containment operator efficiently.
        tags: text("tags").array().notNull().default([]),
        viewCount: bigint("view_count", { mode: "number" }).notNull().default(0),
        likeCount: integer("like_count").notNull().default(0),
        dislikeCount: integer("dislike_count").notNull().default(0),
        publishedAt: timestamp("published_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        searchVector: tsvector("search_vector"),
    },
    (t) => ({
        channelIdx: index("videos_channel_idx").on(t.channelId, t.publishedAt.desc()),
        privacyIdx: index("videos_privacy_idx").on(t.privacy, t.publishedAt.desc()),
        statusIdx: index("videos_status_idx").on(t.status),
        unlistedIdx: uniqueIndex("videos_unlisted_slug_idx").on(t.unlistedSlug),
        searchGin: index("videos_search_gin").using("gin", t.searchVector),
        trgmTitle: index("videos_title_trgm").using("gin", sql`title gin_trgm_ops`),
        tagsGin: index("videos_tags_gin").using("gin", t.tags),
    }),
);

export const videoVariants = pgTable(
    "video_variants",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        videoId: uuid("video_id")
            .notNull()
            .references(() => videos.id, { onDelete: "cascade" }),
        rung: videoVariantRung("rung").notNull(),
        width: integer("width").notNull(),
        height: integer("height").notNull(),
        // Peak bandwidth (bps) used by hls.js to pick the right rung.
        bandwidth: integer("bandwidth").notNull(),
        codecs: text("codecs").notNull(),
        playlistPath: text("playlist_path").notNull(),
    },
    (t) => ({
        uniqRung: uniqueIndex("video_variants_uniq").on(t.videoId, t.rung),
    }),
);

export const videoCaptions = pgTable(
    "video_captions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        videoId: uuid("video_id")
            .notNull()
            .references(() => videos.id, { onDelete: "cascade" }),
        // BCP-47 tag, e.g. "en", "en-GB", "es".
        lang: text("lang").notNull(),
        label: text("label").notNull(),
        source: captionSource("source").notNull(),
        vttPath: text("vtt_path").notNull(),
        isDefault: boolean("is_default").notNull().default(false),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        uniqLang: uniqueIndex("video_captions_uniq").on(t.videoId, t.lang),
    }),
);

export const videoChapters = pgTable(
    "video_chapters",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        videoId: uuid("video_id")
            .notNull()
            .references(() => videos.id, { onDelete: "cascade" }),
        startSec: integer("start_sec").notNull(),
        endSec: integer("end_sec"),
        title: text("title").notNull(),
        source: chapterSource("source").notNull(),
    },
    (t) => ({
        videoIdx: index("video_chapters_video_idx").on(t.videoId, t.startSec),
    }),
);

export type Video = typeof videos.$inferSelect;
export type VideoInsert = typeof videos.$inferInsert;
export type VideoVariant = typeof videoVariants.$inferSelect;
export type VideoCaption = typeof videoCaptions.$inferSelect;
export type VideoChapter = typeof videoChapters.$inferSelect;
export type VideoPrivacy = (typeof videoPrivacy.enumValues)[number];
export type VideoStatus = (typeof videoStatus.enumValues)[number];
