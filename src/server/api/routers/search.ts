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
    tag: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(30)
        .optional(),
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
        case "hour":
            return "1 hour";
        case "today":
            return "1 day";
        case "week":
            return "7 days";
        case "month":
            return "30 days";
        case "year":
            return "365 days";
    }
};

// pg_trgm SET LOCAL fragments — defaults are 0.3 / 0.6 which are too strict
// for real typos: e.g. word_similarity('smke', 'Smoke Sample') = 0.4 doesn't
// fire `<%`. We lower them inside a transaction so the `%` / `<%` operators
// stay index-backed (GIN trgm) while accepting more permissive matches.
// SET LOCAL is transaction-scoped, which keeps the change off other queries
// sharing the pooled connection.
const TRGM_SIM_LIMIT = sql`SET LOCAL pg_trgm.similarity_threshold = 0.15`;
const TRGM_WORD_SIM_LIMIT = sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.3`;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const searchRouter = createTRPCRouter({
    /**
     * Full-text video search with optional filters.
     * Uses websearch_to_tsquery against videos.search_vector (GIN-indexed).
     * Orders by ts_rank DESC then publishedAt DESC for freshness tie-breaking.
     */
    videos: publicProcedure.input(videosInputSchema).query(async ({ ctx, input }) => {
        const { q, uploadedWithin, duration, hasCaptions, tag, cursor = 0, limit } = input;

        // Build WHERE fragments that get ANDed together in the final query.
        // We use raw sql template literals because websearch_to_tsquery, ts_rank
        // and the pg_trgm operators are not exposed through Drizzle's typed API.
        //
        // Match clause is a hybrid: FTS catches keyword/lexeme hits (fast, ranked
        // well, picks up multi-word queries), and pg_trgm `%` / `<%` against the
        // GIN-indexed title backs that up with typo tolerance. A typo like
        // "smke" becomes a tsquery lexeme 'smke' which never matches 'smoke',
        // but the trigram side still finds it. Both sides hit GIN indexes
        // (videos_search_gin and videos_title_trgm) so postgres bitmap-ORs them.
        // When q is empty (tag-only search), skip the match filter entirely.
        const ftsClause = q.trim()
            ? sql`(v.search_vector @@ websearch_to_tsquery('simple', ${q}) OR v.title % ${q} OR ${q} <% v.title)`
            : sql`TRUE`;
        const privacyClause = sql`v.privacy = 'public' AND v.status = 'ready'`;

        const intervalClause = uploadedWithin
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

        const tagClause = tag ? sql`v.tags @> ARRAY[${tag}]::text[]` : sql`TRUE`;

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

        // Combined relevance: FTS rank for keyword hits, plus trigram word
        // similarity scaled to a comparable 0..1-ish range so a fuzzy hit on the
        // title still ranks above a stale exact-FTS hit. GREATEST picks whichever
        // signal is stronger per row.
        const rankExpr = q.trim()
            ? sql`GREATEST(
                    ts_rank(v.search_vector, websearch_to_tsquery('simple', ${q})),
                    word_similarity(${q}, v.title) * 0.6,
                    similarity(v.title, ${q}) * 0.5
                )`
            : sql`0`;

        const rows = await ctx.db.transaction(async (tx) => {
            await tx.execute(TRGM_SIM_LIMIT);
            await tx.execute(TRGM_WORD_SIM_LIMIT);
            return tx.execute<Row>(sql`
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
        });

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
     * Autocomplete suggestions — rich payloads per kind.
     * Three separate trigram queries join the metadata each row needs to
     * render a useful preview (thumbnails/durations/uploaders for videos,
     * avatars + counts for channels, owner + item count for playlists).
     */
    autocomplete: publicProcedure.input(autocompleteInputSchema).query(async ({ ctx, input }) => {
        const { q } = input;

        if (q.trim().length < 2) return [];

        type VideoRow = {
            id: string;
            public_id: string | null;
            title: string;
            description: string | null;
            thumbnail_path: string | null;
            duration_sec: number | null;
            view_count: number;
            published_at: Date | null;
            channel_id: string;
            channel_name: string;
            channel_handle: string;
            sim: number;
        };
        type ChannelRow = {
            id: string;
            name: string;
            handle: string;
            avatar_path: string | null;
            subscriber_count: number;
            video_count: number;
            sim: number;
        };
        type PlaylistRow = {
            id: string;
            title: string;
            owner_name: string | null;
            item_count: number;
            sim: number;
        };

        // Trigram match: `%` is whole-string similarity (good for full-title
        // typos), `<%` is word_similarity — finds the best matching window
        // inside the title, which is what makes "smk" → "smoke sample" work.
        // Both ops use the videos_title_trgm GIN index; postgres bitmap-ORs
        // them. Thresholds are lowered via SET LOCAL inside the transaction
        // (see TRGM_SIM_LIMIT) so common typos actually clear the operator
        // bar. Ranking takes the stronger of the two signals.
        //
        // Three queries run sequentially inside the transaction rather than
        // in parallel: SET LOCAL only binds to the connection that ran it,
        // and Promise.all over tx would interleave statements unpredictably.
        // Autocomplete totals are small (5/3/2 rows) so the sequential cost
        // is well under the round-trip we'd save.
        const { videoRows, channelRows, playlistRows } = await ctx.db.transaction(async (tx) => {
            await tx.execute(TRGM_SIM_LIMIT);
            await tx.execute(TRGM_WORD_SIM_LIMIT);
            const videoRows = await tx.execute<VideoRow>(sql`
                SELECT
                    v.id, v.public_id, v.title, v.description, v.thumbnail_path,
                    v.duration_sec, v.view_count, v.published_at,
                    c.id AS channel_id, c.name AS channel_name, c.handle AS channel_handle,
                    GREATEST(similarity(v.title, ${q}), word_similarity(${q}, v.title)) AS sim
                FROM videos v
                INNER JOIN channels c ON c.id = v.channel_id
                WHERE (v.title % ${q} OR ${q} <% v.title)
                    AND v.privacy = 'public'
                    AND v.status = 'ready'
                    AND v.is_draft = false
                ORDER BY sim DESC, v.view_count DESC
                LIMIT 5
            `);
            const channelRows = await tx.execute<ChannelRow>(sql`
                SELECT
                    c.id, c.name, c.handle, c.avatar_path,
                    (SELECT COUNT(*)::int FROM subscriptions s WHERE s.channel_id = c.id) AS subscriber_count,
                    (SELECT COUNT(*)::int FROM videos v
                        WHERE v.channel_id = c.id
                            AND v.privacy = 'public'
                            AND v.status = 'ready'
                            AND v.is_draft = false) AS video_count,
                    GREATEST(
                        similarity(c.name, ${q}),
                        word_similarity(${q}, c.name),
                        similarity(c.handle, ${q})
                    ) AS sim
                FROM channels c
                WHERE c.name % ${q}
                    OR ${q} <% c.name
                    OR c.handle % ${q}
                ORDER BY sim DESC
                LIMIT 3
            `);
            const playlistRows = await tx.execute<PlaylistRow>(sql`
                SELECT
                    p.id, p.title,
                    u.name AS owner_name,
                    (SELECT COUNT(*)::int FROM playlist_items pi WHERE pi.playlist_id = p.id) AS item_count,
                    GREATEST(similarity(p.title, ${q}), word_similarity(${q}, p.title)) AS sim
                FROM playlists p
                LEFT JOIN "user" u ON u.id = p.owner_id
                WHERE (p.title % ${q} OR ${q} <% p.title)
                    AND p.privacy = 'public'
                    AND p.kind = 'user'
                ORDER BY sim DESC
                LIMIT 2
            `);
            return { videoRows, channelRows, playlistRows };
        });

        const videos = videoRows.map((r) => ({
            kind: "video" as const,
            sim: Number(r.sim),
            href: `/watch/${r.public_id ?? r.id}`,
            id: r.id,
            publicId: r.public_id,
            title: r.title,
            description: r.description ?? "",
            thumbnailPath: r.thumbnail_path,
            durationSec: r.duration_sec,
            viewCount: Number(r.view_count),
            publishedAt: r.published_at,
            channelId: r.channel_id,
            channelName: r.channel_name,
            channelHandle: r.channel_handle,
        }));

        const channels = channelRows.map((r) => ({
            kind: "channel" as const,
            sim: Number(r.sim),
            href: `/@${r.handle}`,
            id: r.id,
            name: r.name,
            handle: r.handle,
            avatarPath: r.avatar_path,
            subscriberCount: Number(r.subscriber_count),
            videoCount: Number(r.video_count),
        }));

        const playlists = playlistRows.map((r) => ({
            kind: "playlist" as const,
            sim: Number(r.sim),
            href: `/playlist/${r.id}`,
            id: r.id,
            title: r.title,
            ownerName: r.owner_name,
            itemCount: Number(r.item_count),
        }));

        return { videos, channels, playlists };
    }),

    /**
     * Channel search via pg_trgm similarity on (name, handle). Returns
     * subscriber count and ready-public video count for the result card.
     */
    channels: publicProcedure.input(channelsInputSchema).query(async ({ ctx, input }) => {
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

        const rows = await ctx.db.transaction(async (tx) => {
            await tx.execute(TRGM_SIM_LIMIT);
            await tx.execute(TRGM_WORD_SIM_LIMIT);
            return tx.execute<Row>(sql`
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
                    GREATEST(
                        similarity(c.name, ${q}),
                        word_similarity(${q}, c.name),
                        similarity(c.handle, ${q})
                    ) AS sim
                FROM channels c
                WHERE c.name % ${q}
                    OR ${q} <% c.name
                    OR c.handle % ${q}
                ORDER BY sim DESC, "subscriberCount" DESC
                LIMIT ${limit + 1}
                OFFSET ${cursor}
            `);
        });

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
    playlists: publicProcedure.input(playlistsInputSchema).query(async ({ ctx, input }) => {
        const { q, cursor = 0, limit } = input;

        type Row = {
            id: string;
            title: string;
            description: string;
            ownerName: string;
            itemCount: number;
            sim: number;
        };

        const rows = await ctx.db.transaction(async (tx) => {
            await tx.execute(TRGM_SIM_LIMIT);
            await tx.execute(TRGM_WORD_SIM_LIMIT);
            return tx.execute<Row>(sql`
                SELECT
                    p.id,
                    p.title,
                    p.description,
                    u.name                                                                  AS "ownerName",
                    (SELECT count(*) FROM playlist_items pi WHERE pi.playlist_id = p.id)::int AS "itemCount",
                    GREATEST(similarity(p.title, ${q}), word_similarity(${q}, p.title)) AS sim
                FROM playlists p
                JOIN "user" u ON u.id = p.owner_id
                WHERE (p.title % ${q} OR ${q} <% p.title)
                  AND p.privacy = 'public'
                  AND p.kind = 'user'
                ORDER BY sim DESC, "itemCount" DESC
                LIMIT ${limit + 1}
                OFFSET ${cursor}
            `);
        });

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
     * Trending tags — top N most-frequently-used tags across public+ready
     * videos. Caller is expected to wrap this in `unstable_cache` for a
     * 5-minute TTL on the home page; the procedure itself just runs the
     * aggregate.
     *
     * `tags` is a text[] column with a GIN index. UNNEST + GROUP BY scales
     * fine until the row count gets into the millions; switch to a
     * materialised view if/when that becomes a problem.
     */
    trendingTags: publicProcedure
        .input(z.object({ limit: z.number().int().min(1).max(50).default(12) }))
        .query(async ({ ctx, input }) => {
            type Row = { tag: string; uses: number };
            const rows = await ctx.db.execute<Row>(sql`
                SELECT tag, count(*)::int AS uses
                FROM videos v, unnest(v.tags) AS tag
                WHERE v.privacy = 'public'
                  AND v.status = 'ready'
                  AND v.is_draft = false
                GROUP BY tag
                ORDER BY uses DESC, tag ASC
                LIMIT ${input.limit}
            `);
            return rows.map((r) => ({ tag: r.tag, uses: Number(r.uses) }));
        }),

    /**
     * Combined search — for v1 this is a thin wrapper over `videos`.
     * Channel and playlist tabs are wired to dedicated procedures above;
     * `all` exists so the client router can call `search.all` uniformly.
     */
    all: publicProcedure.input(allInputSchema).query(async ({ ctx, input }) => {
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

        // Hybrid match + rank — see the `videos` procedure above for the full
        // explanation. Short version: FTS for keyword hits, pg_trgm for typos
        // and partial words, GREATEST picks the strongest signal per row.
        const rows = await ctx.db.transaction(async (tx) => {
            await tx.execute(TRGM_SIM_LIMIT);
            await tx.execute(TRGM_WORD_SIM_LIMIT);
            return tx.execute<Row>(sql`
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
                    GREATEST(
                        ts_rank(v.search_vector, websearch_to_tsquery('simple', ${q})),
                        word_similarity(${q}, v.title) * 0.6,
                        similarity(v.title, ${q}) * 0.5
                    ) AS rank
                FROM videos v
                JOIN channels c ON c.id = v.channel_id
                WHERE
                    (v.search_vector @@ websearch_to_tsquery('simple', ${q})
                        OR v.title % ${q}
                        OR ${q} <% v.title)
                    AND v.privacy = 'public'
                    AND v.status = 'ready'
                ORDER BY rank DESC, v.published_at DESC
                LIMIT ${limit + 1}
                OFFSET ${cursor}
            `);
        });

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
