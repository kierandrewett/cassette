# cassette — Implementation Plan

A self-hosted, YouTube-shaped personal video platform.

## Context

Greenfield project at `/home/kieran/dev/videos`. The product is `cassette`: a self-hosted, YouTube-shaped video platform that runs on the operator's own hardware, accepts uploads via a simple HTTP API (channel-scoped API keys, so you can `curl -F file=@x.mp4` from your own scripts), and serves the catalogue back to viewers as adaptive HLS. The frontend is publicly accessible: anonymous viewers can watch any public or unlisted video without an account; auth is only required for likes, comments, subscribing, playlists, history, queue, and uploading.

Two research agents produced (a) a YouTube feature-gap audit and (b) a technical-stack survey. Their findings, plus the user's clarifying answers, are baked into this plan. An external code-review agent ("codex") will review the implementation on completion.

**Pinned decisions (from user):**

- Project name: **cassette**.
- T3 stack with **Drizzle** (not Prisma); Next.js App Router; tRPC v11; Postgres.
- **Better-Auth** (not NextAuth/Auth.js) for user accounts (email + password) AND **channel-scoped API keys** that authenticate the upload API.
- Library is **upload-driven** (no Emby-style folder scan). Each channel can mint API keys; keys belong to a single channel.
- Pre-transcode every upload to a full ABR ladder (1080p / 720p / 480p / 360p) with HLS, **MPEG-TS `.ts` segments** (`hls_segment_type=mpegts`), `hls_time=6`. Master playlist + per-variant playlists.
- Two bind-mounted volumes: `MEDIA_SOURCE_PATH` (originals, the Emby-style "arbitrary path") and `MEDIA_HLS_PATH` (regenerable derived assets).
- Privacy: public / unlisted (random ≥22-char slug acts as URL secret) / private (HMAC signed token bound to videoId+userId).
- All v1 gap features in scope: quality + speed selectors, chapters from description timestamps, autoplay / up-next, watch later, search filters, autocomplete, resume-on-thumbnail.
- **Cross-device-synced "Up Next" queue, hidden from the user's playlist list, implemented as a `kind='queue'` system playlist row** so it reuses the playlist tables transparently.
- **Package manager: yarn** (mandatory per Kieran's workflow). All scripts use `yarn install`, `yarn dev`, `yarn build`, `yarn db:push`.
- **UI components: shadcn/ui** primitives extended into a custom layout. The visual brief mixes **YouTube layout / IA** (left rail, video grid, watch page composition, comment thread shape) with **Apple TV player aesthetic** (translucent glass overlays, fade-on-idle, refined typography). Components are added with `npx shadcn@latest add ...` and the generated files are restyled, not used off-the-shelf.
- **Typography: `system-ui`** with the stack `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No Google Fonts, no custom font binaries.
- **Code conventions** follow Kieran's standard: 4-space indent, 120-col print width, semicolons, double quotes, trailing commas, ESM, strict TS, named exports, British English in user-facing prose.

**Out of scope for v1** (noted for future work): live streaming, Shorts, monetisation/memberships, detailed analytics, Whisper auto-captions, scheduled publish, end screens / cards, TUS resumable upload.

---

## 1. Architecture Overview

```
                            +------------------------------------------+
                            |         Next.js (App Router) app          |
   Browser <---HTTPS--->    |  - Pages (RSC + client islands)           |
   (Vidstack player)        |  - tRPC v11        (/api/trpc/*)          |
                            |  - Better-Auth     (/api/auth/*)          |
                            |  - REST upload     (/api/upload)          |
                            |  - HLS stream      (/api/hls/<videoId>/*) |
                            |  - In-process pg-boss worker (boot hook)  |
                            +-----+-----------------+--------------+-----+
                                  |                 |              |
                          (drizzle)|         (pg-boss)|      (fs read)|
                                  v                 v              v
                            +-----------+    +-----------+   +----------------+
                            | Postgres  |<---| pg-boss   |   | MEDIA_HLS_PATH |
                            | (schema)  |    | jobs tbl  |   | (segments,     |
                            +-----------+    +-----------+   |  sprites, vtt) |
                                                             +----------------+
                                                              ^
                                                              |  ffmpeg / ffprobe
                                                              |
                                                       +--------------+
                                                       | MEDIA_SOURCE |
                                                       |  (originals) |
                                                       +--------------+
```

**Data flow.** Client (web UI session OR API key) POSTs a video to `/api/upload`. Handler authenticates, creates a `videos` row with `status='queued'`, streams bytes to `MEDIA_SOURCE_PATH/<channelHandle>/<videoId>.<ext>`, enqueues a `transcode` pg-boss job, returns `{ videoId, statusUrl }`. The worker (in-process for v1) probes, runs the ABR ladder, writes everything under `MEDIA_HLS_PATH/<videoId>/`, parses chapters, extracts captions, flips status to `ready`, refreshes search vector. Viewers hit `/watch/<videoId>` → RSC renders metadata + Vidstack `<Player>` whose source is `/api/hls/<videoId>/master.m3u8`, which gates by privacy and serves segments with HTTP Range support.

**Single-deployment-unit choice.** pg-boss worker boots inside the Next.js Node process via `instrumentation.ts` (idempotent guard on `globalThis.__VIDEO_WORKER_BOOTED__`). Worker code lives under `src/worker/` so splitting into a separate container later is a Dockerfile + compose change, not a refactor. Rationale: simpler operator mental model for self-host. Documented escape hatch.

---

## 2. Repository Layout

```
videos/
  package.json
  yarn.lock
  next.config.mjs
  drizzle.config.ts
  tsconfig.json
  tailwind.config.ts
  postcss.config.mjs
  .env.example
  docker/
    Dockerfile
    entrypoint.sh
  docker-compose.yml
  drizzle/                          # generated migrations
  scripts/
    seed.ts
    create-admin.ts
  src/
    env.ts                          # zod-validated env
    instrumentation.ts              # registers pg-boss worker once
    middleware.ts                   # better-auth session refresh
    app/
      layout.tsx
      page.tsx                      # home
      (marketing)/login/page.tsx
      (marketing)/register/page.tsx
      watch/[videoId]/page.tsx
      c/[handle]/(channel-tabs)/...
      search/page.tsx
      playlist/[id]/page.tsx
      history/page.tsx
      library/page.tsx
      subscriptions/page.tsx
      studio/(routes)/page.tsx
      studio/upload/page.tsx
      studio/videos/page.tsx
      studio/api-keys/page.tsx
      api/
        auth/[...all]/route.ts                                    # Better-Auth handler
        trpc/[trpc]/route.ts
        upload/route.ts                                           # REST multipart
        upload/[videoId]/captions/route.ts                        # add captions later
        hls/[videoId]/master.m3u8/route.ts
        hls/[videoId]/[variant]/playlist.m3u8/route.ts
        hls/[videoId]/[variant]/[segment]/route.ts
        hls/[videoId]/captions/[lang].vtt/route.ts
        hls/[videoId]/thumb/sprite.jpg/route.ts
        hls/[videoId]/thumb/sprite.vtt/route.ts
    components/
      player/Player.tsx              # Vidstack client component
      player/ChapterMarkers.tsx
      player/UpNextOverlay.tsx
      video/VideoCard.tsx            # red progress bar overlay
      comments/CommentTree.tsx
      shared/...
    lib/
      auth.ts                        # better-auth server instance
      auth-client.ts                 # better-auth react client
      hls/sign.ts                    # HMAC token utils
      hls/playlist.ts                # rewrite playlist segment URLs
      hls/range.ts                   # Range header parsing
      transcode/probe.ts             # ffprobe wrapper
      transcode/ladder.ts            # rung calculator (drop > source height)
      transcode/ffmpeg.ts            # spawn helpers
      transcode/sprite.ts            # scrubber sprite + WebVTT
      transcode/captions.ts          # sub stream extraction
      transcode/chapters.ts          # ffprobe + description parse
      paths.ts                       # MEDIA_* path resolvers
      slug.ts                        # nanoid-based unlisted slug
      fmt.ts                         # duration, view-count
    server/
      api/
        root.ts                      # appRouter
        trpc.ts                      # ctx + middlewares
        routers/
          channel.ts
          video.ts
          comment.ts
          subscription.ts
          like.ts
          playlist.ts
          history.ts
          search.ts
          notification.ts
      db/
        client.ts                    # drizzle({ pool })
        schema/
          auth.ts                    # better-auth tables
          channels.ts
          videos.ts
          social.ts                  # subs, likes, comments
          playlists.ts
          history.ts
          notifications.ts
          jobs.ts
          index.ts                   # re-exports
        triggers.sql                 # tsvector trigger
    worker/
      boot.ts                        # registerWorker() boot hook
      jobs/transcode.ts
      jobs/regenerate-thumbs.ts
```

---

## 3. Database Schema (Drizzle)

Postgres extensions required (init script): `citext`, `pg_trgm`, `pgcrypto` (for `gen_random_uuid()`).

### 3.1 Better-Auth tables (`src/server/db/schema/auth.ts`)

Better-Auth's official Drizzle adapter generates `user`, `session`, `account`, `verification`, plus `apikey` when the api-key plugin is enabled. We adopt the generated shape verbatim and re-export typed handles. Run `npx @better-auth/cli generate` against the pinned version and treat its output as canonical. Key fields:

```ts
export const user = pgTable("user", {
  id: text("id").primaryKey(),                              // better-auth uses text id
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", { /* providerId, accountId, password (hashed), refresh tokens — per better-auth */ });
export const verification = pgTable("verification", { /* identifier, value, expiresAt */ });

// Better-Auth api-key plugin table
export const apikey = pgTable("apikey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),                  // visible prefix
  prefix: text("prefix"),
  key: text("key").notNull(),            // hashed
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(true),
  // ... refillInterval, refillAmount, lastRefillAt, requestCount, remaining, lastRequest, expiresAt
  metadata: jsonb("metadata"),           // {"channelId": "..."} — see §15
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Channel scoping for API keys.** Better-Auth's api-key plugin supports a free-form `metadata` JSON field on each key. We store `{ "channelId": "<uuid>" }` there. **Open question §15.1**: if a future plugin version drops `metadata`, fall back to a sibling table `api_key_channel(api_key_id PK FK, channel_id FK)` joined at validation time.

### 3.2 Channels (`channels.ts`)

```ts
export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: citext("handle").notNull().unique(),     // "@" stripped, e.g. "kieran"
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  avatarPath: text("avatar_path"),                  // relative to MEDIA_HLS_PATH/_assets
  bannerPath: text("banner_path"),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  handleIdx: uniqueIndex("channels_handle_idx").on(t.handle),
  ownerIdx:  index("channels_owner_idx").on(t.ownerId),
}));

export const channelMembers = pgTable("channel_members", {
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role", { enum: ["owner", "manager", "uploader"] }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.channelId, t.userId] }) }));
```

`citext` so handles are case-insensitive but preserve original casing. `restrict` on owner prevents deleting a user that still owns channels (UI must reassign first).

### 3.3 Videos (`videos.ts`)

```ts
export const videoPrivacy = pgEnum("video_privacy", ["public", "unlisted", "private"]);
export const videoStatus  = pgEnum("video_status",  ["queued", "transcoding", "ready", "failed"]);

export const videos = pgTable("videos", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId:    uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  uploaderId:   text("uploader_id").notNull().references(() => user.id, { onDelete: "set null" }),
  title:        text("title").notNull(),
  description:  text("description").notNull().default(""),
  privacy:      videoPrivacy("privacy").notNull().default("public"),
  unlistedSlug: text("unlisted_slug"),                 // 22+ char nanoid for unlisted
  status:       videoStatus("status").notNull().default("queued"),
  sourcePath:   text("source_path").notNull(),         // relative to MEDIA_SOURCE_PATH
  hlsDir:       text("hls_dir"),                       // relative to MEDIA_HLS_PATH
  durationSec:  integer("duration_sec"),
  width:        integer("width"),
  height:       integer("height"),
  fps:          numeric("fps", { precision: 6, scale: 3 }),
  videoCodec:   text("video_codec"),
  audioCodec:   text("audio_codec"),
  thumbnailPath: text("thumbnail_path"),
  spriteJpgPath: text("sprite_jpg_path"),
  spriteVttPath: text("sprite_vtt_path"),
  viewCount:    bigint("view_count", { mode: "number" }).notNull().default(0),
  likeCount:    integer("like_count").notNull().default(0),
  dislikeCount: integer("dislike_count").notNull().default(0),
  publishedAt:  timestamp("published_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  searchVector: tsvector("search_vector"),             // populated by trigger, see §11
}, (t) => ({
  channelIdx:  index("videos_channel_idx").on(t.channelId, t.publishedAt.desc()),
  privacyIdx:  index("videos_privacy_idx").on(t.privacy, t.publishedAt.desc()),
  unlistedIdx: uniqueIndex("videos_unlisted_slug_idx").on(t.unlistedSlug),
  searchGin:   index("videos_search_gin").using("gin", t.searchVector),
  trgmTitle:   index("videos_title_trgm").using("gin", sql`title gin_trgm_ops`),
}));

export const videoVariants = pgTable("video_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  rung: text("rung", { enum: ["360p","480p","720p","1080p"] }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bandwidth: integer("bandwidth").notNull(),       // peak bps
  codecs: text("codecs").notNull(),                // 'avc1.640028,mp4a.40.2'
  playlistPath: text("playlist_path").notNull(),   // relative to hlsDir
}, (t) => ({ uniqRung: uniqueIndex("video_variants_uniq").on(t.videoId, t.rung) }));

export const videoCaptions = pgTable("video_captions", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  lang: text("lang").notNull(),                    // BCP-47
  label: text("label").notNull(),                  // "English", "Español"
  source: text("source", { enum: ["embedded", "sidecar"] }).notNull(),
  vttPath: text("vtt_path").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
}, (t) => ({ uniqLang: uniqueIndex("video_captions_uniq").on(t.videoId, t.lang) }));

export const videoChapters = pgTable("video_chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  startSec: integer("start_sec").notNull(),
  endSec:   integer("end_sec"),
  title:    text("title").notNull(),
  source:   text("source", { enum: ["description", "container"] }).notNull(),
}, (t) => ({ vidIdx: index("video_chapters_video_idx").on(t.videoId, t.startSec) }));
```

### 3.4 Social — comments, subs, likes (`social.ts`)

```ts
export const subscriptions = pgTable("subscriptions", {
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  notify:    boolean("notify").notNull().default(true),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.channelId] }) }));

export const videoLikeKind = pgEnum("video_like_kind", ["like","dislike"]);
export const videoLikes = pgTable("video_likes", {
  userId:  text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  kind:    videoLikeKind("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.videoId] }) }));

export const comments = pgTable("comments", {
  id:       uuid("id").primaryKey().defaultRandom(),
  videoId:  uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "set null" }),
  parentId: uuid("parent_id").references((): any => comments.id, { onDelete: "cascade" }),
  rootId:   uuid("root_id"),                       // = id for top-level (denorm for fast tree query)
  body:     text("body").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  isHearted: boolean("is_hearted").notNull().default(false),
  editedAt:  timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  likeCount:    integer("like_count").notNull().default(0),
  dislikeCount: integer("dislike_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  videoIdx: index("comments_video_idx").on(t.videoId, t.isPinned.desc(), t.createdAt.desc()),
  rootIdx:  index("comments_root_idx").on(t.rootId, t.createdAt.asc()),
}));

export const commentLikes = pgTable("comment_likes", {
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  kind:      videoLikeKind("kind").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.commentId] }) }));
```

One-level threading is enforced in the API (`comment.create`: if `input.parentId` then load parent; reject if `parent.parentId !== null`). `rootId` denorm allows a single indexed query to fetch a thread.

### 3.5 Playlists — including hidden queue (`playlists.ts`)

```ts
export const playlistKind    = pgEnum("playlist_kind",    ["user","queue","watch_later"]);
export const playlistPrivacy = pgEnum("playlist_privacy", ["public","unlisted","private"]);

export const playlists = pgTable("playlists", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind:        playlistKind("kind").notNull().default("user"),
  title:       text("title").notNull(),
  description: text("description").notNull().default(""),
  privacy:     playlistPrivacy("privacy").notNull().default("private"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerKindIdx: index("playlists_owner_kind_idx").on(t.ownerId, t.kind),
  // exactly one queue + one watch_later per user:
  uniqSystem: uniqueIndex("playlists_uniq_system").on(t.ownerId, t.kind)
              .where(sql`kind in ('queue','watch_later')`),
}));

export const playlistItems = pgTable("playlist_items", {
  id:         uuid("id").primaryKey().defaultRandom(),
  playlistId: uuid("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
  videoId:    uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  position:   integer("position").notNull(),
  addedAt:    timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPos:     uniqueIndex("playlist_items_uniq_pos").on(t.playlistId, t.position),
  playlistIdx: index("playlist_items_playlist_idx").on(t.playlistId, t.position),
}));
```

The queue is just `kind='queue'`; `playlist.list` filters `kind='user'` so the queue and watch-later are hidden from the public playlists tab. Watch later is exposed in `/library` via a dedicated section, not in the playlists list. The system rows are created lazily on first use ("ensure-on-first-use" helper). Alternative considered: a separate `queue_items` table — rejected because it duplicates ordering logic and breaks the "syncs across devices via the same playlist tables" guarantee.

### 3.6 History & progress (`history.ts`)

```ts
export const watchHistory = pgTable("watch_history", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  videoId:   uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index("watch_history_user_idx").on(t.userId, t.watchedAt.desc()) }));

export const watchProgress = pgTable("watch_progress", {
  userId:      text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  videoId:     uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  positionSec: integer("position_sec").notNull(),
  durationSec: integer("duration_sec").notNull(),
  completed:   boolean("completed").notNull().default(false),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk:      primaryKey({ columns: [t.userId, t.videoId] }),
  userIdx: index("watch_progress_user_idx").on(t.userId, t.updatedAt.desc()),
}));

export const viewSessions = pgTable("view_sessions", {
  id:          uuid("id").primaryKey().defaultRandom(),
  videoId:     uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  sessionHash: text("session_hash").notNull(),    // hash(ip + ua + day) for anon
  userId:      text("user_id"),
  countedAt:   timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dedupe: uniqueIndex("view_sessions_dedupe")
          .on(t.videoId, t.sessionHash, sql`date_trunc('hour', counted_at)`),
}));
```

The 30-min view-count de-dupe: `recordView` mutation INSERTs with `ON CONFLICT DO NOTHING` on a derived 30-min bucket (`floor(extract(epoch from now())/1800)`); on insert, increment `videos.view_count` in the same tx.

### 3.7 Notifications (`notifications.ts`)

```ts
export const notifKind = pgEnum("notif_kind", ["new_upload","comment_reply"]);
export const notifications = pgTable("notifications", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind:      notifKind("kind").notNull(),
  videoId:   uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  readAt:    timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx:   index("notif_user_idx").on(t.userId, t.createdAt.desc()),
  unreadIdx: index("notif_unread_idx").on(t.userId).where(sql`read_at is null`),
}));
```

### 3.8 Transcode jobs (`jobs.ts`)

pg-boss owns its `pgboss.*` schema. We mirror visible state into `transcode_jobs` for UI rendering:

```ts
export const transcodeJobs = pgTable("transcode_jobs", {
  id:           uuid("id").primaryKey().defaultRandom(),
  videoId:      uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  pgbossJobId:  text("pgboss_job_id"),
  state:        text("state", { enum: ["queued","running","completed","failed"] }).notNull().default("queued"),
  progress:     integer("progress").notNull().default(0),  // 0–100
  message:      text("message"),
  startedAt:    timestamp("started_at", { withTimezone: true }),
  finishedAt:   timestamp("finished_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ vidIdx: index("transcode_jobs_video_idx").on(t.videoId, t.createdAt.desc()) }));
```

The worker updates this row at each pipeline step; the Studio polls via `video.uploadStatus`.

---

## 4. tRPC Router Map

`src/server/api/trpc.ts` exports `publicProcedure`, `protectedProcedure` (requires session), `channelProcedure` (requires session + role check on `:channelId`).

```
auth         — handled by Better-Auth at /api/auth/*; tRPC has only `me()` for convenience
channel      — list({}), byHandle({handle}), create({handle,name}), update({id,...}),
               listMine(), generateApiKey({channelId,name}), listApiKeys({channelId}),
               revokeApiKey({apiKeyId})
video        — byId({id, unlistedSlug?}), list({channelId?, cursor, limit, sort}),
               listByChannel({handle}), updateMetadata({id, title, description, privacy}),
               setPrivacy({id, privacy}), delete({id}),
               recordView({id}), recordProgress({id, positionSec}), getProgress({id}),
               uploadStatus({id}) -> {state, progress, message}
comment      — list({videoId, cursor}), listReplies({rootId, cursor}),
               create({videoId, body, parentId?}), update({id, body}),
               softDelete({id}), pin({id, pinned}), heart({id, hearted}),
               like({id}), dislike({id})
subscription — subscribe({channelId, notify?}), unsubscribe({channelId}),
               listMine(), feed({cursor})
like         — toggleVideo({videoId, kind}), toggleComment({commentId, kind})
playlist     — list({}), byId({id}), create({title, privacy}), update({id,...}),
               delete({id}), addItem({playlistId, videoId}), removeItem({itemId}),
               reorder({playlistId, itemIds}),
               queue.peek(), queue.add({videoId, position?}), queue.next(),
               queue.clear(), queue.list(),
               watchLater.add({videoId}), watchLater.remove({videoId}), watchLater.list()
history      — list({cursor}), clear(), remove({videoId})
search       — videos({q, filters, cursor}), autocomplete({q}), all({q})
notification — list({cursor, unreadOnly?}), markRead({id}), markAllRead(), unreadCount()
```

Pagination: cursor-based using the indexed sort key (e.g. `(publishedAt, id)`). All list inputs share a Zod `cursorInput` schema.

---

## 5. Upload API Design

**Endpoint:** `POST /api/upload` (Next.js Route Handler, `runtime = 'nodejs'`).

**Auth (two paths share the handler):**
1. **API key** — `Authorization: Bearer vid_<key>` validated through Better-Auth's `apiKey.verify`. Channel resolved from `apikey.metadata.channelId`.
2. **Session cookie** — when `?channelId=...` query is present and the session user is a member of that channel.

**Body shape (v1 multipart, not TUS):**
```
Content-Type: multipart/form-data; boundary=...
fields:
  title       (required, ≤200 chars)
  description (optional, ≤10k chars)
  privacy     (public|unlisted|private; default 'public')
  channelId   (required when using session auth; ignored when using API key)
  file        (the video file; one only)
  captions[]  (optional, repeated; filename pattern "lang-LABEL.vtt", e.g. "en-English.vtt")
```

Multipart over TUS chosen for v1 because the operator typically uploads on the same LAN; complexity of TUS not justified. Hard cap **20 GB** (`MAX_UPLOAD_BYTES`). TUS is a documented future upgrade. Streaming via `busboy` (or `formidable`) — never buffer in memory.

**Flow:**
1. Authenticate (API key or session). 401 on failure.
2. Validate auth principal can upload to the resolved channel.
3. `INSERT INTO videos (...) RETURNING id` with `status='queued'` and a placeholder source path.
4. Stream `file` to `${MEDIA_SOURCE_PATH}/${channel.handle}/${videoId}${ext}`. Compute sha256 along the way.
5. Stream each `captions[i]` to `${MEDIA_SOURCE_PATH}/${channel.handle}/${videoId}.captions/<lang>.vtt`.
6. Update `videos.sourcePath` and (if captions) seed `video_captions` rows with `source='sidecar'`.
7. `await boss.send('transcode', { videoId }, { retryLimit: 2, retryBackoff: true, expireInHours: 6, singletonKey: videoId })`.
8. Insert mirror row in `transcode_jobs`.
9. Respond `201 { videoId, status: "queued", statusUrl: "/api/trpc/video.uploadStatus?...", watchUrl: "/watch/<videoId>" }`.

**Errors:** 413 if streaming size exceeds cap; 415 implicit (let file land, ffprobe fails the job with a clear message).

---

## 6. Transcoding Worker

**Process model.** `src/worker/boot.ts` exports `registerWorker()`. Called once from `instrumentation.ts` (Next.js instrumentation hook) when `process.env.NEXT_RUNTIME === 'nodejs'`. Idempotent guard via `globalThis.__VIDEO_WORKER_BOOTED__`.

```ts
boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })
await boss.start()
await boss.work('transcode',
  { teamSize: env.TRANSCODE_CONCURRENCY ?? 1, teamConcurrency: 1 },
  transcodeHandler
)
```

`teamSize` defaults to 1 (ffmpeg saturates CPU); operators with more cores set `TRANSCODE_CONCURRENCY=2+`.

**Pipeline (per job).** Inputs `{ videoId }`. Each step updates `transcode_jobs.progress`:

1. **probe (5%)** — `ffprobe -v error -show_streams -show_format -show_chapters -of json source.mp4`. Persist width/height/fps/codecs/duration. If video stream missing → fail.
2. **ladder (10%)** — drop rungs above source height. Rung defs:
   - 1080p: 1920×1080, 5000k video, 192k audio
   - 720p:  1280×720,  2800k video, 160k audio
   - 480p:  854×480,   1400k video, 128k audio
   - 360p:  640×360,    800k video,  96k audio
3. **transcode variants (10→70%)** — single ffmpeg invocation with multi-output mapping; `[v:0]split` filter; emit per-rung playlists + `master.m3u8`. Sketch (libx264 path):
   ```
   ffmpeg -y -i SRC \
     -filter_complex "[0:v]split=N[v1][v2]...; \
        [v1]scale=w=1920:h=1080:force_original_aspect_ratio=decrease[v1o]; ..." \
     -map "[v1o]" -map 0:a:0? -c:v:0 libx264 -preset veryfast -profile:v high -level 4.1 \
       -b:v:0 5000k -maxrate:v:0 5350k -bufsize:v:0 7500k -g 60 -keyint_min 60 -sc_threshold 0 \
     -c:a:0 aac -b:a:0 192k -ac 2 \
     -map "[v2o]" -map 0:a:0? -c:v:1 libx264 ... -b:v:1 2800k ... \
     -f hls -hls_time 6 -hls_segment_type mpegts -hls_playlist_type vod \
     -hls_flags independent_segments+program_date_time \
     -master_pl_name master.m3u8 \
     -hls_segment_filename "<HLS_DIR>/%v/seg-%05d.ts" \
     -var_stream_map "v:0,a:0,name:1080p v:1,a:1,name:720p ..." \
     "<HLS_DIR>/%v/playlist.m3u8"
   ```
   `-g 60 -keyint_min 60 -sc_threshold 0` enforces ~60-frame keyframe cadence (matches `hls_time 6` on common framerates).

4. **NVENC opt-in.** At worker boot, `ffmpeg -hide_banner -encoders | grep h264_nvenc`. If present and `ENABLE_NVENC=1`, swap `-c:v libx264 -preset veryfast` for `-c:v h264_nvenc -preset p4 -tune hq -rc vbr -cq 21`. Audio path unchanged. Log fallback if requested but unavailable.

5. **thumbnail (75%)** — `ffmpeg -ss <duration*0.10> -i SRC -frames:v 1 -q:v 3 thumb.jpg`.

6. **scrubber sprite (85%)** — extract 100 frames (10×10 grid) at evenly spaced offsets (cap to `min(100, ceil(duration/2))` for short videos):
   ```
   ffmpeg -i SRC -vf "fps=100/<duration>,scale=160:-1,tile=10x10" sprite.jpg
   ```
   Then write `sprite.vtt` mapping each cue to `sprite.jpg#xywh=…`.

7. **captions (90%)** — for each subtitle stream from probe: `ffmpeg -i SRC -map 0:s:N -c:s webvtt out.vtt`. Insert `video_captions` rows with `source='embedded'`.

8. **chapters (92%)** — merge container chapters from ffprobe with description-parsed chapters (regex `^\s*(\d{1,2}:)?\d{1,2}:\d{2}\s+\S.*$` per line; first must be `00:00`; permits `-`/`–`/`—` separators). Description chapters take precedence on conflict (creator intent).

9. **finalize (100%)** — UPDATE videos: `status='ready'`, `hlsDir`, `thumbnailPath`, `spriteJpgPath`, `spriteVttPath`, `publishedAt = COALESCE(publishedAt, now())`, `durationSec`. Insert `video_variants` rows. tsvector trigger refreshes search vector. Emit `new_upload` notifications via `INSERT … SELECT FROM subscriptions WHERE channel_id=$1 AND notify=true`.

**Failure handling.** Try/catch around each step; on throw, set `transcode_jobs.state='failed'`, `videos.status='failed'`, store last 4 KB of stderr in `message`. pg-boss retries up to `retryLimit=2` with backoff.

---

## 7. HLS Streaming Endpoints

All routes under `app/api/hls/[videoId]/...`. Runtime `nodejs`.

**Privacy decision tree (per request):**
```
load video by id
if status != 'ready' -> 404
switch (privacy):
  public:    allow
  unlisted:  require ?slug=<unlistedSlug> match (constant-time compare) OR a valid signed token
  private:   require valid signed token bound to (videoId, userId)
             (login-derived token issued by /watch page server component)
```

The master playlist response rewrites each variant URI with `?t=<token>` for private videos. Variant playlists similarly rewrite each `seg-XXXXX.ts` URI.

**Signed token format** (HMAC-SHA256, no DB lookup):
```
payload = base64url(JSON.stringify({ v: videoId, u: userIdOrNull, exp: epochSec }))
sig     = base64url(hmacSha256(secret, payload))
token   = `${payload}.${sig}`
```
- `secret` = `env.HLS_SIGNING_SECRET` (rotated by env-var change; old tokens expire fast)
- `exp` = now + 4 hours (long enough for one watch session, short enough to deter scraping)
- Token bound to `videoId` so a leak can't unlock a different video.
- For unlisted: accept either the slug OR a token (lets us shorten URLs later).

**Range support sketch (segment route):**
```ts
export async function GET(req: Request, { params }: { params: { videoId: string; variant: string; segment: string } }) {
  const v = await loadVideoOrThrow(params.videoId);
  await assertPlayableForRequest(v, req);
  const file = path.join(env.MEDIA_HLS_PATH, v.hlsDir!, params.variant, params.segment);
  const stat = await fs.promises.stat(file);
  const range = req.headers.get("range");
  const total = stat.size;
  if (!range) {
    return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
      status: 200,
      headers: { "Content-Length": String(total), "Content-Type": "video/MP2T",
                 "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }
  const [s, e] = parseRange(range, total);
  const stream = fs.createReadStream(file, { start: s, end: e });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      "Content-Range": `bytes ${s}-${e}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(e - s + 1),
      "Content-Type": "video/MP2T",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

Cache headers: segments and sprites are immutable (UUID-based paths) → `max-age=31536000, immutable`. Master/variant playlists → `no-store` for private/unlisted (token in URL); `max-age=60` for public.

---

## 8. Frontend Pages

**Visual language (global).** The whole app shares the player's design vocabulary: dark-first (true black `#000` / off-black `#0b0b0d` backgrounds), `system-ui` typography (no web fonts, no Google Fonts), generous white-space, subtle glass-blur surfaces (`backdrop-filter: blur(20px) saturate(150%)`) on overlays/menus, rounded corners (cards `12px`, buttons `9999px`), 2-px white focus rings, soft hover tints (`rgba(255,255,255,.06)`). All shells use a left rail (collapsible to icons) for navigation: Home, Subscriptions, Library, History, Search, plus channel switcher at the bottom. The IA mirrors YouTube (left-rail + content-grid + sticky search header + watch-page two-column with sidebar Up Next); shadcn/ui primitives provide the building blocks (Button, DropdownMenu, Sheet, Tabs, Tooltip, Toast, Dialog, ScrollArea, Avatar, Input, Slider) and are restyled in `src/components/ui/*` to match the cassette aesthetic.

| Route | tRPC procedures | Components |
|---|---|---|
| `/` | `subscription.feed`, `video.list({sort:'recent'})` | `SubscriptionsRow`, `VideoGrid` |
| `/watch/[videoId]` | `video.byId`, `comment.list`, `subscription.subscribe`, `like.toggleVideo`, `playlist.queue.peek`, `video.recordView`, `video.getProgress` | `Player`, `ChapterList`, `Description` (auto-link timestamps), `CommentTree`, `UpNextSidebar` |
| `/c/[handle]` (tabs) | `channel.byHandle`, `video.listByChannel`, `playlist.list({channelId})` | `ChannelHeader`, `VideoGrid`, `PlaylistGrid`, `AboutPanel` |
| `/search` | `search.videos`, `search.autocomplete` | `SearchFilters`, `SearchResultList` |
| `/playlist/[id]` | `playlist.byId` | `PlaylistHeader`, `PlaylistItemList` |
| `/history` | `history.list`, `history.clear`, `history.remove` | `HistoryList` |
| `/library` | `playlist.list`, `playlist.queue.list`, `playlist.watchLater.list`, `history.list({limit:8})` | `LibrarySections` |
| `/subscriptions` | `subscription.listMine`, `subscription.feed` | `SubscriptionGrid` |
| `/studio` | `channel.listMine`, `video.list`, transcode poll | `StudioOverview` |
| `/studio/upload` | `video.uploadStatus` (post-upload) | `UploadForm` (multipart fetch to `/api/upload`) |
| `/studio/videos` | `video.list`, `video.updateMetadata`, `video.setPrivacy`, `video.delete` | `VideoTable` |
| `/studio/api-keys` | `channel.listApiKeys`, `channel.generateApiKey`, `channel.revokeApiKey` | `ApiKeysPanel` (full key shown once; thereafter only `start`) |
| `/login`, `/register` | (Better-Auth) | client forms hitting `/api/auth/*` |

`VideoCard` always pulls `watchProgress` (single batched query in the parent loader) and overlays a 2-px red bar at `position/duration`. Hovering a card on desktop expands it slightly (scale 1.02, soft shadow) and starts a muted preview from the sprite frames after 600 ms.

### 8.1 Channel page (`/c/[handle]`)

Apple-TV-style: a full-bleed banner image with a soft dark gradient at the bottom, channel avatar (96 px circle) overlapping the banner edge, large channel name in semibold, `@handle` and subscriber count below in muted text, a primary "Subscribe" pill button on the right (filled red when subscribed, hover shows bell-toggle dropdown for `notify` flag).

Tabs (sticky as user scrolls): **Videos · Playlists · About**.
- **Videos tab:** `VideoGrid` with sort dropdown (Latest / Popular / Oldest), responsive 2/3/4-column layout, virtualised at 60+ rows. Pulls `video.listByChannel({handle, sort, cursor})`.
- **Playlists tab:** `PlaylistGrid` showing public playlists owned by channel members (queue/watch_later filtered out). Pulls `playlist.list({channelId, kind:'user', privacy:'public'})`.
- **About tab:** Markdown-rendered description, channel statistics (joined date, total videos, total views), external links if added, contact email gated behind an "I'm not a robot" reveal.

Channel-owner UI: when `ctx.user` is a member of this channel, a "Customize channel" button overlays the banner (replaces Subscribe), routing to `/studio` with the channel preselected.

### 8.2 Playlist page (`/playlist/[id]`)

Two-column desktop layout: left rail (sticky, ~360 px) shows the playlist hero — a stacked-thumbnail mosaic of the first 4 items, playlist title, owner channel name + avatar, item count, total runtime, privacy badge, "Play all" primary button (enqueues the whole playlist into the queue and starts the first), "Shuffle play" secondary button, "+ Save" / "✎ Edit" depending on ownership. Right column is a draggable, virtualised list of items: index number, thumbnail with progress overlay, title, channel, duration, and a hover-only "Remove" / "Save to queue" / "Save to watch later" overflow menu. Drag handles on the left re-order via `playlist.reorder`. Clicking an item navigates to `/watch/<videoId>?playlist=<playlistId>` so the player picks up the playlist as the queue scope (next/prev iterate the playlist instead of the user's global queue).

Playlist privacy badge: "Public" / "Unlisted (link only)" / "Private". Unlisted playlists expose a "Copy share link" action that includes a slug query param.

### 8.3 Library (`/library`) — including the hidden Queue

The Library is the user's personal hub. Sections (in order, each a horizontal scrolling row à la Apple TV's "Watch Now"):
1. **Up Next** — items from the system queue (`kind='queue'`, hidden from playlist lists). Cards have a "Remove from queue" hover affordance. Drag-to-reorder. Empty state: "Add videos to your queue and they'll appear here on every device you use."
2. **Continue Watching** — entries from `watchProgress` where `completed=false AND position > 5`, ordered by `updatedAt DESC`. Limit 12.
3. **Watch Later** — items from the system `kind='watch_later'` playlist.
4. **Your Playlists** — `kind='user'` playlists; "+ New playlist" tile at the end.
5. **Recently Watched** — last 8 from `watchHistory`, with a "See all" link to `/history`.
6. **Subscriptions** — last 8 from `subscription.feed`, with "See all" linking to `/subscriptions`.

The Up Next section is the only surface that exposes the queue — the queue never appears in `/playlist` listings or in the channel "Playlists" tab, satisfying the "hidden internal playlist" requirement while transparently syncing across devices via the playlist tables.

### 8.4 History (`/history`)

A reverse-chronological list grouped by day ("Today", "Yesterday", "Apr 28", …). Each entry: thumbnail (with red progress bar), title, channel, watched-at relative time, hover overflow menu with "Remove from history" / "Save to playlist" / "Add to queue". A sticky header has a search box (filters within the user's own history client-side), a "Pause history" toggle (writes to `users.history_paused` — adds a column to user table later, not v1 critical), and a "Clear all watch history" destructive button with confirm modal. Pulls `history.list({cursor, limit:50})` paginated infinite-scroll.

### 8.5 Subscriptions (`/subscriptions`)

A subscriptions-only feed (videos from channels the user has subscribed to), default sort "Latest". A second tab "All" shows a flat grid of all subscribed channels with last-upload timestamp and a small bell toggle per channel.

### 8.6 Studio (`/studio/*`)

Channel owner dashboard. Sidebar items: Overview, Videos, Upload, API Keys, Settings. Reuses the same global aesthetic but with denser list layouts (table view for the Videos page).

- **Upload** — drag-and-drop area (or click to choose); shows a stack of in-flight uploads, each with progress bar (XHR upload progress), and post-upload polls `video.uploadStatus` to follow the transcode pipeline through queued → transcoding → ready, surfacing the `progress` percentage and current step (e.g. "Generating sprite…").
- **API Keys** — list of keys with name, prefix, last-used, request count, "Revoke" button. "Generate key" modal asks for a name; on submit shows the plaintext `vid_…` once with a copy button and a "I've saved this" confirmation that closes the modal.

---

## 9. Player Component (Vidstack — custom Apple-TV-styled layout)

**Aesthetic target.** Replicate the Apple TV / tvOS native video player: translucent glass-blur overlay controls that fade in on pointer/keyboard activity and fade out after about 3 s of idle, the OS sans-serif (`system-ui` resolves to SF on Apple, Segoe on Windows, Roboto on Android — exactly what we want), title and channel name bleeding at the top of the canvas, large central pulse-on-hover play/pause, a slim bottom scrubber that grows on focus with a generous thumbnail preview floating above it, and subtle blurred dark vignettes on the top/bottom edges so light video frames do not wash out the chrome. **Control surface** is YouTube-complete: quality selector, playback speed (0.25–2.0x), captions language picker, picture-in-picture, theatre mode, miniplayer, fullscreen, autoplay toggle, chapter navigation, and the full keyboard shortcut set.

**Implementation choice.** We DO NOT use Vidstack's `DefaultVideoLayout`. We use Vidstack's headless components (`<MediaPlayer>`, `<MediaProvider>`, `<TimeSlider>`, `<PlayButton>`, `<MuteButton>`, `<FullscreenButton>`, `<Captions>`, `<Menu>`, `<Track>`) and compose our own JSX layout, styled with Tailwind + a small `player.css` for keyframe animations and `backdrop-filter` glass effects. Vidstack's headless API exposes the state we need; HLS.js is auto-attached when source is `.m3u8` and browser isn't Safari.

**Component tree:**
```
Player (Vidstack <MediaPlayer>)
└── PlayerCanvas
    ├── <MediaProvider>                              // <video> element + tracks
    ├── PlayerVignette                               // top + bottom gradients (always visible)
    ├── PlayerTopBar (fade w/ controls)
    │   ├── ChannelAvatar + ChannelHandle
    │   ├── VideoTitle (truncate, two-line)
    │   └── CloseTheaterButton (only in theater mode)
    ├── PlayerCenterStage
    │   ├── BigPlayPauseButton (visible only when paused or hovering — Apple-TV pulse)
    │   └── BufferSpinner
    ├── PlayerBottomBar (fade w/ controls)
    │   ├── ScrubberRow
    │   │   ├── ChapterTrack (segmented bar; gaps at chapter boundaries)
    │   │   ├── TimeSlider (Vidstack) with custom thumb + progress + buffered
    │   │   └── ScrubberPreview (160px×90px sprite frame + chapter title above)
    │   ├── ControlsRow
    │   │   ├── Left:  PlayPauseButton, ←10/→10s skip, NextInQueueButton, TimeDisplay
    │   │   ├── Mid:   ChapterMenu (jump to chapter)
    │   │   └── Right: VolumeStack, CaptionsMenu, SettingsMenu (Quality/Speed),
    │   │              AutoplayToggle, MiniPlayerButton, PiPButton, TheaterButton, FullscreenButton
    └── UpNextOverlay  (10 s before end, only if queue.next exists)
```

**Glass / fade behavior.** The TopBar and BottomBar share an `is-active` data attribute toggled by a custom `useIdleControls()` hook (mouse-move, focus-within, key-down → set active for 3 s). Both bars use:
```css
.player-bar {
  background: linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0));
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  transition: opacity 200ms cubic-bezier(.2,.8,.2,1), transform 200ms cubic-bezier(.2,.8,.2,1);
}
.player-bar[data-active="false"] { opacity: 0; transform: translateY(8px); pointer-events: none; }
```
Cursor is hidden (`cursor: none`) while inactive in fullscreen. Buttons use a 36 px hit-target with a 28 px icon, hover tint `rgba(255,255,255,0.12)`, focus-ring `outline: 2px solid rgba(255,255,255,0.6)`, all border-radius `9999px` for the round Apple feel.

**ScrubberPreview.** While dragging or hovering the time slider, render a floating box positioned at the cursor X with:
- The sprite frame (160×90 from `sprite.jpg#xywh=…`, taken by parsing `sprite.vtt`).
- Above the frame: the chapter title (if any) for that timestamp.
- A 1 px white-rgba border, `border-radius: 8px`, soft drop-shadow.

**ChapterTrack.** Renders a 4 px tall scrubber background subdivided into segments (one per chapter) separated by 2 px gaps, matching YouTube's chapter bar. The played portion fills with `rgba(255,255,255,.95)`; unplayed `rgba(255,255,255,.25)`; buffered `rgba(255,255,255,.45)`.

**SettingsMenu.** A single gear icon opens a Vidstack `<Menu>` with submenus:
- **Quality** — auto + each `videoVariants.rung` ("1080p", "720p", "480p", "360p"); shows current bandwidth on auto.
- **Playback speed** — 0.25, 0.5, 0.75, Normal, 1.25, 1.5, 1.75, 2.0.
- **Stats for nerds** (collapsed by default) — current rung, buffered seconds, dropped frames, fps.

**CaptionsMenu.** Lists all `videoCaptions` rows; toggles via `<Captions>`.

**Source wiring:**
```tsx
"use client";
export function Player({ video, captions, chapters, signedToken }: Props) {
  const tokenQS = signedToken ? `?t=${signedToken}` : "";
  return (
    <MediaPlayer
      className="player relative aspect-video w-full overflow-hidden bg-black [--media-focus-ring:transparent]"
      src={`/api/hls/${video.id}/master.m3u8${tokenQS}`}
      crossOrigin
      playsInline
      streamType="on-demand"
      load="eager"
      onEnded={advanceQueue}
    >
      <MediaProvider />

      {/* metadata track for sprite previews */}
      <Track src={`/api/hls/${video.id}/thumb/sprite.vtt`} kind="metadata" default label="thumbnails" />

      {captions.map((c) => (
        <Track key={c.lang}
               src={`/api/hls/${video.id}/captions/${c.lang}.vtt${tokenQS}`}
               kind="subtitles" srcLang={c.lang} label={c.label} default={c.isDefault} />
      ))}

      <PlayerCanvas>
        <PlayerVignette />
        <PlayerTopBar video={video} />
        <PlayerCenterStage />
        <PlayerBottomBar chapters={chapters} variants={video.variants} />
        <UpNextOverlay nextId={queueNextId} />
      </PlayerCanvas>
    </MediaPlayer>
  );
}
```

**Keyboard shortcuts** wired with `useMediaKeyShortcuts({...})` (Vidstack hook): space/K = play/pause, J/L = ±10 s, ←/→ = ±5 s, 0–9 = seek %, M = mute, ↑/↓ = volume, F = fullscreen, T = theater, I = miniplayer, C = captions, > / < = speed up/down.

**Watch progress beacon.**
```ts
useEffect(() => {
  const send = () => {
    const pos = remote.player?.currentTime ?? 0;
    const body = JSON.stringify({ id: video.id, positionSec: Math.floor(pos) });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/trpc/video.recordProgress', body);
    else void trpc.video.recordProgress.mutate({ id: video.id, positionSec: Math.floor(pos) });
  };
  const t = setInterval(send, 5000);
  const onPause = () => send();
  player.addEventListener('pause', onPause);
  return () => { clearInterval(t); player.removeEventListener('pause', onPause); send(); };
}, [video.id]);
```

On mount, if `getProgress()` returns `position > 5 && !completed`, seek there immediately and show a "Resume from X:XX" toast (Apple-TV-styled glass card, top-right) with "Restart" button.

**Up-Next overlay.** From `duration - 10` to `duration`, fade in a bottom-right card showing the next queue item's thumbnail, title, channel, and a 10-s countdown ring. Click to advance immediately; press X to dismiss; auto-advance on `ended` if not dismissed. Card uses the same backdrop-blur language as the bars.

**Up-Next autoplay logic.** On `ended`, call `playlist.queue.next()` which atomically pops the head; if non-null, `router.push('/watch/' + next.videoId)`. If queue empty, fall back to "recommended" (v1: most recent video from same channel).

**Theater mode.** Toggles a `data-theater="true"` attribute on the page-level container; CSS responds by widening the player to viewport width and pushing the comments/sidebar below the fold. Reuses the `useTheaterMode()` zustand store so the state persists across route navigations within the watch app shell.

**Mini-player.** When the user navigates away from `/watch/<id>` while a video is still playing, the player detaches into a draggable picture-in-picture-style card (300×170 px, bottom-right by default, snaps to the four corners). Implemented by hoisting `<MediaPlayer>` into the root layout when an "active session" exists in zustand — no `unmount` happens on route change.

---

## 10. Auth Wiring (Better-Auth)

`src/lib/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "better-auth/plugins";
import { db } from "@/server/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  plugins: [
    apiKey({
      enableMetadata: true,                 // verify (§15.1)
      defaultPrefix: "vid_",
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 60 },
    }),
  ],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
});
```

**Catch-all route handler:** `app/api/auth/[...all]/route.ts` exports `GET = handler.handler` and `POST = handler.handler`.

**tRPC context:**
```ts
export const createContext = async ({ req }: { req: Request }) => {
  const session = await auth.api.getSession({ headers: req.headers });
  return { db, session, user: session?.user ?? null };
};
```
`protectedProcedure` checks `ctx.user`. `channelProcedure(role)` joins `channelMembers`.

**API-key middleware (upload route):**
```ts
const header = req.headers.get("authorization");
if (header?.startsWith("Bearer ")) {
  const key = header.slice(7);
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid) return Response.json({ error: "invalid_api_key" }, { status: 401 });
  const channelId = (result.key.metadata as any)?.channelId;
  if (!channelId) return Response.json({ error: "key_missing_channel" }, { status: 400 });
  // … proceed
}
```

`channel.generateApiKey` calls `auth.api.createApiKey({ body: { userId: ctx.user.id, name, metadata: { channelId } } })` and returns the plaintext key **once**; afterwards only `apikey.start` (visible prefix) is shown.

---

## 11. Search Implementation

**`videos.search_vector`** is populated by trigger (not a `GENERATED` column, because we need to join the channel name):

```sql
CREATE FUNCTION videos_search_refresh() RETURNS trigger AS $$
DECLARE chan_name text;
BEGIN
  SELECT name INTO chan_name FROM channels WHERE id = NEW.channel_id;
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title,'')),       'A') ||
    setweight(to_tsvector('simple', coalesce(chan_name,'')),       'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.description,'')), 'C');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER videos_search_trg
  BEFORE INSERT OR UPDATE OF title, description, channel_id
  ON videos FOR EACH ROW EXECUTE FUNCTION videos_search_refresh();
```
Plus a backfill trigger on `channels.name` updates that touches affected videos. `simple` config (no stemming) chosen to handle a multi-language corpus typical of self-host.

**Query (videos):**
```sql
SELECT v.*,
       ts_rank(v.search_vector, websearch_to_tsquery('simple', $1)) AS rank
FROM videos v
WHERE v.privacy = 'public' AND v.status = 'ready'
  AND v.search_vector @@ websearch_to_tsquery('simple', $1)
  AND ($2::interval IS NULL OR v.published_at > now() - $2)
  AND ($3::int IS NULL OR v.duration_sec BETWEEN $3 AND $4)
  AND ($5::bool IS NULL OR EXISTS (SELECT 1 FROM video_captions c WHERE c.video_id = v.id) = $5)
ORDER BY rank DESC, v.published_at DESC
LIMIT 20;
```

**Autocomplete (pg_trgm):**
```sql
SELECT title FROM videos
WHERE privacy='public' AND status='ready'
  AND title % $1
ORDER BY similarity(title, $1) DESC, view_count DESC
LIMIT 10;
```

Channel/playlist suggestions union in similar trigram queries against `channels.name` and `playlists.title`.

---

## 12. Docker

**`docker/Dockerfile`** (multi-stage):
```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable && yarn install --immutable

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.js"]
```

**`docker-compose.yml`:**
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: videos
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: videos
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
    healthcheck:
      test: ["CMD-SHELL","pg_isready -U videos"]
      interval: 5s
  app:
    build: { context: ., dockerfile: docker/Dockerfile }
    depends_on: { db: { condition: service_healthy } }
    environment:
      DATABASE_URL: postgres://videos:${POSTGRES_PASSWORD}@db:5432/videos
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: ${PUBLIC_URL}
      HLS_SIGNING_SECRET: ${HLS_SIGNING_SECRET}
      MEDIA_SOURCE_PATH: /media/source
      MEDIA_HLS_PATH: /media/hls
      ENABLE_NVENC: ${ENABLE_NVENC:-0}
      MAX_UPLOAD_BYTES: ${MAX_UPLOAD_BYTES:-21474836480}
      TRANSCODE_CONCURRENCY: ${TRANSCODE_CONCURRENCY:-1}
    volumes:
      - ${MEDIA_SOURCE_PATH}:/media/source
      - ${MEDIA_HLS_PATH}:/media/hls
    ports: [ "3000:3000" ]
    # Optional NVENC: uncomment under runtime:
    # runtime: nvidia
    # deploy: { resources: { reservations: { devices: [{ driver: nvidia, count: all, capabilities: [gpu, video] }] } } }
volumes:
  pgdata: {}
```

**`.env.example`** (host-side): `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `HLS_SIGNING_SECRET` (≥32 bytes random), `PUBLIC_URL`, `MEDIA_SOURCE_PATH` (host bind path — the **arbitrary path**, like Emby), `MEDIA_HLS_PATH`, `ENABLE_NVENC`, `MAX_UPLOAD_BYTES`, `TRANSCODE_CONCURRENCY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (used only on first boot if no users exist).

---

## 13. Bootstrap & First-Run Flow

1. `docker compose up -d db` then `yarn db:push` (or migrations baked into image entrypoint).
2. App container starts. `instrumentation.ts` → `registerWorker()`.
3. `scripts/seed.ts` runs at startup if `users` table is empty: creates an admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
4. Operator visits `/login`, signs in.
5. `/studio` prompts: "Create your first channel" → choose handle + name → row inserted; `queue` and `watch_later` system playlists created lazily.
6. `/studio/api-keys` → "Generate key" → modal shows the plaintext `vid_…` once.
7. Upload via curl: `curl -F file=@vid.mp4 -F title=Hello -H "Authorization: Bearer vid_…" http://host:3000/api/upload`.
8. Studio's video list polls `video.uploadStatus`; row goes queued → transcoding → ready with progress.
9. Anonymous viewer opens `/watch/<id>` and streams.

---

## 14. Verification Plan

End-to-end checks the reviewer (or QA) should run, in order:

1. **Auth boot** — fresh DB, app starts, default admin can log in; `/api/auth/sign-up/email` rejects duplicate emails.
2. **Channel + key** — create channel `@kieran`; generate API key; only key prefix visible after dialog closes; revoke and confirm `verifyApiKey` returns invalid.
3. **Upload via curl** — multipart upload returns 201 with videoId; row exists; pg-boss queue depth=1; `transcode_jobs.state` transitions queued → running → completed.
4. **HLS reachable** — `curl -I http://host:3000/api/hls/<id>/master.m3u8` returns 200; segment URL returns 206 with `Content-Range` for `Range: bytes=0-1023`.
5. **Anonymous watch** — incognito browser plays video; player adapts quality; sprite preview shows on hover; chapters appear as markers.
6. **Captions** — sidecar `.vtt` accepted; embedded subs extracted; CC button toggles them.
7. **Privacy** — set to private; anonymous watch returns 401 on master.m3u8; logged-in viewer sees signed-token URLs in master playlist response (devtools Network); token rejected after `exp`.
8. **Unlisted** — set to unlisted; `/watch/<id>` 404 without `?slug=`; with slug, plays; not listed in `/c/<handle>` or search.
9. **Social** — like, dislike (mutually exclusive); subscribe; comment; reply (one level); attempt second-level reply via direct tRPC call → rejected; pin & heart visible only to channel owner UI.
10. **Queue + autoplay** — add 3 videos to queue from VideoCard menu; first ends → second auto-loads; library shows queue under sidebar but NOT under playlists tab.
11. **Watch later** — add via card menu; visible in `/library`; not in `/playlist` route list.
12. **History/resume** — watch 30s, reload `/watch/<id>` → resumes from ~30s; thumbnail in `/history` shows red progress bar.
13. **Search** — typing in nav shows autocomplete after 200 ms debounce; results page filters by date+duration+captions; private/unlisted excluded.
14. **Notifications** — second user subscribes; first user uploads; bell shows unread; click marks read.
15. **NVENC fallback** — set `ENABLE_NVENC=1` on a CPU-only machine; worker logs "nvenc requested but not available, falling back to libx264" and proceeds.

---

## 15. Risks & Open Questions (for codex review)

1. **Better-Auth API-key metadata.** Current docs show a `metadata` field on key creation/verification. Confirm wire shape (`jsonb` vs `text`) against the version we pin. **Mitigation if unsupported:** sibling table `api_key_channels(api_key_id text PK FK, channel_id uuid FK)`; resolve at verify time.
2. **Better-Auth Drizzle table-shape drift.** Library has shifted column names between minors. **Mitigation:** generate the schema with `npx @better-auth/cli generate` against the pinned version, treat that as canonical, and import its types in our other tables.
3. **App Router Range responses.** Wrapping `fs.createReadStream` as a Web `ReadableStream` worked in Next 14.1+, but minor versions had issues with `Content-Length` mismatches on client disconnect. **Mitigation:** pin Next 15+, attach an explicit abort `signal` listener, add a tiny CI integration test (`curl -r 100-199 …`).
4. **File size cap.** v1 hard cap **20 GB** per upload. Future: TUS via `@tus/server` mounted at `/api/upload/tus`.
5. **Worker in-process.** A pathological 4K source can pin all CPUs and slow user requests. Acceptable v1 tradeoff; mitigate with `TRANSCODE_CONCURRENCY=1` default and a documented "scale out" path (separate worker container reading the same DB & volumes).
6. **HLS token in URL leaks via referer.** Standard for HLS. Mitigation: short TTL (4h), per-video binding; documented.
7. **`citext` extension availability.** Some Postgres installs (esp. shared hosting) lack `citext`; we ship `CREATE EXTENSION IF NOT EXISTS citext` in init and document as required.
8. **Sprite frame count vs duration.** For videos < 100 s, 100 frames is excessive; cap to `min(100, ceil(duration/2))` and reshape tile (10×N or N×10).
9. **Description chapter parsing edge cases.** Lines like `1:23 - intro` are common; regex permits optional `-`/`–`/`—`. Worth a small unit-test fixture.
10. **Postgres tsvector `simple` vs `english`.** `simple` avoids stemming surprises across multi-language corpora typical of self-host; we accept slightly worse English recall.

---

## 16. Sequenced Milestones

| # | Deliverable | Acceptance |
|---|---|---|
| **M1** | Scaffold | Next.js + tRPC + Tailwind + Drizzle + Docker boot; `/` renders; `db:push` succeeds; CI lints/tests/builds. |
| **M2** | Auth + channels | Email/password sign-up, sign-in; create channel; generate/revoke API key (plaintext shown once); guards via tRPC procedures. |
| **M3** | Upload + transcode | `POST /api/upload` accepts multipart with API key; pg-boss job runs; ABR ladder produced; `videos.status='ready'`; sprite + thumbnail + captions extracted. |
| **M4** | Streaming | `/api/hls/...` serves master, variant, segments with Range; privacy decision tree enforced; HMAC signed tokens for private. Player on a placeholder page plays fine. |
| **M5** | Watch page + Player | `/watch/<id>` server-rendered; Vidstack player; chapters; captions; sprite scrubber; quality+speed; theater/fullscreen/mini-player; keyboard shortcuts; resume + 5s beacon. |
| **M6** | Social | Subscriptions, likes/dislikes, comments (1-level threaded, pin/heart/edit-15min/soft-delete), comment likes; counts updated transactionally. |
| **M7** | Library | Playlists CRUD; queue (system playlist) with auto-advance on `ended`; watch later; watch history with clear/remove; resume bars on cards. |
| **M8** | Search | tsvector + GIN with trigger; pg_trgm autocomplete; filters (date/duration/has-captions/type); search page; nav-bar autocomplete. |
| **M9** | Notifications + polish | Bell icon; subscriber notifications fan-out on transcode finalize; comment reply notifications; rate-limits; error pages; doc/README; verification scripts. |

Future (out of v1 scope): Whisper auto-captions, scheduled publish (pg-boss `sendAfter`), TUS resumable uploads, live streaming, Shorts, analytics dashboard, end screens / cards, multi-channel role management UI.

---

## Critical files to be created

- `/home/kieran/dev/videos/src/server/db/schema/videos.ts`
- `/home/kieran/dev/videos/src/server/db/schema/auth.ts`
- `/home/kieran/dev/videos/src/server/db/schema/playlists.ts`
- `/home/kieran/dev/videos/src/server/db/triggers.sql`
- `/home/kieran/dev/videos/src/lib/auth.ts`
- `/home/kieran/dev/videos/src/worker/jobs/transcode.ts`
- `/home/kieran/dev/videos/src/app/api/upload/route.ts`
- `/home/kieran/dev/videos/src/app/api/hls/[videoId]/master.m3u8/route.ts`
- `/home/kieran/dev/videos/src/app/api/hls/[videoId]/[variant]/[segment]/route.ts`
- `/home/kieran/dev/videos/src/components/player/Player.tsx`
- `/home/kieran/dev/videos/docker/Dockerfile`
- `/home/kieran/dev/videos/docker-compose.yml`
- `/home/kieran/dev/videos/.env.example`
