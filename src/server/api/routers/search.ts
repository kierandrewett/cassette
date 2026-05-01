import { sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const uploadedWithinSchema = z.enum(["hour", "today", "week", "month", "year"]).optional();
const durationSchema = z.enum(["short", "medium", "long"]).optional();

const videosInputSchema = z.object({
    q: z.string().max(200).default(""),
    uploadedWithin: uploadedWithinSchema,
    duration: durationSchema,
    hasCaptions: z.boolean().optional(),
    tag: z.string().regex(/^[a-z0-9-]+$/).max(30).optional(),
    cursor: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(50).default(20),
});

const autocompleteInputSchema = z.object({
    q: z.string().min(1).max(200),
});

const allInputSchema = z.object({
    q: z.string().min(1).max(200),
    cursor: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(50).default(20),
});

const channelsInputSchema = z.object({
    q: z.string().min(1).max(200),
    cursor: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(50).default(20),
});

const playlistsInputSchema = z.object({
    q: z.string().min(1).max(200),
    cursor: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(50).default(20),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map uploadedWithin to a Postgres interval string. */
const uploadedWithinInterval = (v: "hour" | "today" | "week" | "month" | "year"): string => {
    switch (v) {
        case "hour":  return "1 hour";
        case "today": return "1 day";
        case "week":  return "7 days";
        case "month": return "30 days";
        case "year":  return "365 days";
    }
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const searchRouter = createTRPCRouter({
    /**
     * Full-text video search with optional filters.
     * Uses websearch_to_tsquery against videos.search_vector (GIN-indexed).
     * Orders by ts_rank DESC then publishedAt DESC for freshness tie-breaking.
     */
    videos: publicProcedure
        .input(videosInputSchema)
        .query(async ({ ctx, input }) => {
            const { q, uploadedWithin, duration, hasCaptions, tag, cursor = 0, limit } = input;

            // Build WHERE fragments that get ANDed together in the final query.
            // We use raw sql template literals because websearch_to_tsquery and
            // ts_rank are not exposed through Drizzle's typed API.
            // When q is empty (tag-only search), skip FTS filtering entirely.
            const ftsClause = q.trim()
                ? sql`v.search_vector @@ websearch_to_tsquery('simple', ${q})`
                : sql`TRUE`;
            const privacyClause = sql`v.privacy = 'public' AND v.status = 'ready'`;

            const intervalClause =
                uploadedWithin
                    ? sql`v.published_at >= now() - interval ${sql.raw(`'${uploadedWithinInterval(uploadedWithin)}'`)}`
                    : sql`TRUE`;

            const durationClause =
                duration === "short"
                    ? sql`v.duration_sec < 240`
                    : duration === "medium"
                      ? sql`v.duration_sec >= 240 AND v.duration_sec < 1200`
                      : duration === "long"
                        ? sql`v.duration_sec >= 1200`
                        : sql`TRUE`;

            const captionsClause =
                hasCaptions === true
                    ? sql`EXISTS (SELECT 1 FROM video_captions vc WHERE vc.video_id = v.id)`
                    : hasCaptions === false
                      ? sql`NOT EXISTS (SELECT 1 FROM video_captions vc WHERE vc.video_id = v.id)`
                      : sql`TRUE`;

            const tagClause =
                tag
                    ? sql`v.tags @> ARRAY[${tag}]::text[]`
                    : sql`TRUE`;

            type Row = {
                id: string;
                title: string;
                description: string;
                thumbnailPath: string | null;
                durationSec: number | null;
                viewCount: number;
                publishedAt: Date | null;
                channelName: string;
                channelHandle: string;
                rank: number;
            };

            const rankExpr = q.trim()
                ? sql`ts_rank(v.search_vector, websearch_to_tsquery('simple', ${q}))`
                : sql`0`;

            const rows = await ctx.db.execute<Row>(sql`
                SELECT
                    v.id,
                    v.title,
                    v.description,
                    v.thumbnail_path   AS "thumbnailPath",
                    v.duration_sec     AS "durationSec",
                    v.view_count       AS "viewCount",
                    v.published_at     AS "publishedAt",
                    c.name             AS "channelName",
                    c.handle           AS "channelHandle",
                    ${rankExpr} AS rank
                FROM videos v
                JOIN channels c ON c.id = v.channel_id
                WHERE
                    ${ftsClause}
                    AND ${privacyClause}
                    AND ${intervalClause}
                    AND ${durationClause}
                    AND ${captionsClause}
                    AND ${tagClause}
                ORDER BY rank DESC, v.published_at DESC
                LIMIT ${limit + 1}
                OFFSET ${cursor}
            `);

            const items = rows.slice(0, limit);
            const nextCursor = rows.length > limit ? cursor + limit : null;

            return {
                items: items.map((r) => ({
                    id: r.id,
                    title: r.title,
                    description: r.description,
                    thumbnailPath: r.thumbnailPath,
                    durationSec: r.durationSec,
                    viewCount: Number(r.viewCount),
                    publishedAt: r.publishedAt,
                    channel: {
                        name: r.channelName,
                        handle: r.channelHandle,
                    },
                })),
                nextCursor,
            };
        }),

    /**
     * Autocomplete suggestions.
     * Unions video titles, channel names, and playlist titles ranked by
     * pg_trgm similarity. Returns at most 10 items total.
     */
    autocomplete: publicProcedure
        .input(autocompleteInputSchema)
        .query(async ({ ctx, input }) => {
            const { q } = input;

            // Guard: require at least 2 chars so we do not hammer trigram index
            // on single-character queries.
            if (q.trim().length < 2) return [];

            type SuggestionRow = {
                kind: "video" | "channel" | "playlist";
                label: string;
                href: string;
                sim: number;
            };

            const rows = await ctx.db.execute<SuggestionRow>(sql`
                SELECT kind, label, href, sim FROM (
                    SELECT
                        'video'                               AS kind,
                        v.title                              AS label,
                        '/watch/' || v.id                    AS href,
                        similarity(v.title, ${q})            AS sim
                    FROM videos v
                    WHERE
                        v.title % ${q}
                        AND v.privacy = 'public'
                        AND v.status = 'ready'
                    ORDER BY sim DESC
                    LIMIT 5

                    UNION ALL

                    SELECT
                        'channel'                            AS kind,
                        c.name                              AS label,
                        '/c/' || c.handle                   AS href,
                        similarity(c.name, ${q})            AS sim
                    FROM channels c
                    WHERE c.name % ${q}
                    ORDER BY sim DESC
                    LIMIT 3

                    UNION ALL

                    SELECT
                        'playlist'                          AS kind,
                        p.title                            AS label,
                        '/playlist/' || p.id               AS href,
                        similarity(p.title, ${q})          AS sim
                    FROM playlists p
                    WHERE
                        p.title % ${q}
                        AND p.privacy = 'public'
                        AND p.kind = 'user'
                    ORDER BY sim DESC
                    LIMIT 2
                ) sub
                ORDER BY sim DESC
            `);

            return rows.map((r) => ({
                kind: r.kind,
                label: r.label,
                href: r.href,
            }));
        }),

    /**
     * Channel search via pg_trgm similarity on (name, handle). Returns
     * subscriber count and ready-public video count for the result card.
     */
    channels: publicProcedure
        .input(channelsInputSchema)
        .query(async ({ ctx, input }) => {
            const { q, cursor = 0, limit } = input;

            type Row = {
                id: string;
                handle: string;
                name: string;
                description: string;
                avatarPath: string | null;
                bannerPath: string | null;
                subscriberCount: number;
                videoCount: number;
                sim: number;
            };

            const rows = await ctx.db.execute<Row>(sql`
                SELECT
                    c.id,
                    c.handle,
                    c.name,
                    c.description,
                    c.avatar_path                                 AS "avatarPath",
                    c.banner_path                                 AS "bannerPath",
                    (SELECT count(*) FROM subscriptions s
                        WHERE s.channel_id = c.id)::int           AS "subscriberCount",
                    (SELECT count(*) FROM videos v
                        WHERE v.channel_id = c.id
                          AND v.privacy = 'public'
                          AND v.status = 'ready')::int            AS "videoCount",
                    GREATEST(similarity(c.name, ${q}), similarity(c.handle, ${q})) AS sim
                FROM channels c
                WHERE c.name % ${q} OR c.handle % ${q}
                ORDER BY sim DESC, "subscriberCount" DESC
                LIMIT ${limit + 1}
                OFFSET ${cursor}
            `);

            const items = rows.slice(0, limit);
            const nextCursor = rows.length > limit ? cursor + limit : null;

            return {
                items: items.map((r) => ({
                    id: r.id,
                    handle: r.handle,
                    name: r.name,
                    description: r.description,
                    avatarPath: r.avatarPath,
                    bannerPath: r.bannerPath,
                    subscriberCount: r.subscriberCount,
                    videoCount: r.videoCount,
                })),
                nextCursor,
            };
        }),

    /**
     * Public user-playlist search via pg_trgm similarity on title.
     * kind='user' AND privacy='public' filter excludes system playlists
     * (queue, watch_later) and unlisted/private user playlists.
     */
    playlists: publicProcedure
        .input(playlistsInputSchema)
        .query(async ({ ctx, input }) => {
            const { q, cursor = 0, limit } = input;

            type Row = {
                id: string;
                title: string;
                description: string;
                ownerName: string;
                itemCount: number;
                sim: number;
            };

            const rows = await ctx.db.execute<Row>(sql`
                SELECT
                    p.id,
                    p.title,
                    p.description,
                    u.name                                                                  AS "ownerName",
                    (SELECT count(*) FROM playlist_items pi WHERE pi.playlist_id = p.id)::int AS "itemCount",
                    similarity(p.title, ${q})                                              AS sim
                FROM playlists p
                JOIN "user" u ON u.id = p.owner_id
                WHERE p.title % ${q}
                  AND p.privacy = 'public'
                  AND p.kind = 'user'
                ORDER BY sim DESC, "itemCount" DESC
                LIMIT ${limit + 1}
                OFFSET ${cursor}
            `);

            const items = rows.slice(0, limit);
            const nextCursor = rows.length > limit ? cursor + limit : null;

            return {
                items: items.map((r) => ({
                    id: r.id,
                    title: r.title,
                    description: r.description,
                    ownerName: r.ownerName,
                    itemCount: r.itemCount,
                })),
                nextCursor,
            };
        }),

    /**
     * Combined search — for v1 this is a thin wrapper over `videos`.
     * Channel and playlist tabs are wired to dedicated procedures above;
     * `all` exists so the client router can call `search.all` uniformly.
     */
    all: publicProcedure
        .input(allInputSchema)
        .query(async ({ ctx, input }) => {
            const { q, cursor = 0, limit } = input;

            type Row = {
                id: string;
                title: string;
                description: string;
                thumbnailPath: string | null;
                durationSec: number | null;
                viewCount: number;
                publishedAt: Date | null;
                channelName: string;
                channelHandle: string;
                rank: number;
            };

            const rows = await ctx.db.execute<Row>(sql`
                SELECT
                    v.id,
                    v.title,
                    v.description,
                    v.thumbnail_path   AS "thumbnailPath",
                    v.duration_sec     AS "durationSec",
                    v.view_count       AS "viewCount",
                    v.published_at     AS "publishedAt",
                    c.name             AS "channelName",
                    c.handle           AS "channelHandle",
                    ts_rank(v.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
                FROM videos v
                JOIN channels c ON c.id = v.channel_id
                WHERE
                    v.search_vector @@ websearch_to_tsquery('simple', ${q})
                    AND v.privacy = 'public'
                    AND v.status = 'ready'
                ORDER BY rank DESC, v.published_at DESC
                LIMIT ${limit + 1}
                OFFSET ${cursor}
            `);

            const items = rows.slice(0, limit);
            const nextCursor = rows.length > limit ? cursor + limit : null;

            return {
                items: items.map((r) => ({
                    id: r.id,
                    title: r.title,
                    description: r.description,
                    thumbnailPath: r.thumbnailPath,
                    durationSec: r.durationSec,
                    viewCount: Number(r.viewCount),
                    publishedAt: r.publishedAt,
                    channel: {
                        name: r.channelName,
                        handle: r.channelHandle,
                    },
                })),
                nextCursor,
            };
        }),
});

// Re-export input types so the page/components can import them.
export type VideosInput = z.infer<typeof videosInputSchema>;
