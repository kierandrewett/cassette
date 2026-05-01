# cassette — execution checklist

The plan lives in `PLAN.md`. This file is the live, ticked checklist. A ticked
item means shippable; the smoke runner (`scripts/smoke.sh`) is the contract.

## M1 — Scaffold

- [x] Repo init, `.gitignore`, `.editorconfig`
- [x] `package.json` with all dependencies
- [x] yarn 4 via corepack, `.yarnrc.yml`
- [x] `tsconfig.json` (strict, paths)
- [x] `next.config.mjs` (standalone, server-external pkgs)
- [x] Tailwind 3 + PostCSS configs, `globals.css` with cassette palette and player chrome rules
- [x] `prettier`, `eslint`, `editorconfig`
- [x] `components.json` for shadcn (style: new-york, base: neutral, system-ui font)
- [x] `.env.example` and dev `.env`
- [x] `drizzle.config.ts` with snake_case casing
- [x] `src/env.ts` (zod-validated; explicit boolean preprocessing for `ENABLE_NVENC`)
- [x] `src/lib/utils.ts` (`cn`, `formatDuration`, `formatCount`, `formatRelativeTime`)
- [x] `src/app/{layout,page,globals.css}` rendering the cassette landing page
- [x] `docker-compose.yml` (db service + full profile)
- [x] `docker/Dockerfile` (multi-stage, ffmpeg + tini in runner)
- [x] `docker/init-extensions.sql` (citext, pg_trgm, pgcrypto)
- [x] `Justfile` with bootstrap / dev / db / stack recipes
- [x] `README.md`, `CLAUDE.md`, `TODO.md`, `PLAN.md`
- [x] `yarn install` succeeds
- [x] `yarn typecheck` passes
- [x] `yarn build` succeeds
- [x] `yarn dev` boots and `/` renders

## M2 — Auth + channels

- [x] Drizzle schema for Better-Auth tables (`user`, `session`, `account`, `verification`)
- [x] Drizzle schema for `channels`, `channel_members`, `api_keys` (channel-scoped, sha256 hashed plus visible prefix)
- [x] Better-Auth instance with Drizzle adapter (custom `mintApiKey`/`verifyApiKey` since v1.6 has no api-key plugin)
- [x] `/api/auth/[...all]` catch-all route
- [x] tRPC context, `publicProcedure`, `protectedProcedure`, `channelProcedure`
- [x] `channelRouter` (list, byHandle, listMine, create, update, listApiKeys, generateApiKey, revokeApiKey)
- [x] `/login`, `/register` pages with shadcn-styled forms
- [x] `/studio`, `/studio/c/[handle]`, `/studio/c/[handle]/api-keys`
- [x] `scripts/seed-admin.ts` first-run admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- [x] Verified: sign-up, sign-in, channel create, key generate (plaintext shown once), key revoke

## M3 — Upload + transcode

- [x] Schemas: videos, video_variants, video_captions, video_chapters, transcode_jobs, view_sessions (with `bucket` for IMMUTABLE-friendly dedup)
- [x] tsvector trigger and pg_trgm GIN on `videos`
- [x] `paths.ts` helper for source / HLS paths
- [x] `POST /api/upload` (multipart via busboy; static `Readable` import for production bundle)
- [x] pg-boss worker via `instrumentation.ts`; `globalThis` workaround for Next.js module isolation
- [x] `boss.createQueue("transcode-video")` on boot (v10 explicit queues)
- [x] Probe step (ffprobe metadata)
- [x] Ladder step (drop rungs above source height)
- [x] HLS ABR transcode step with `.ts` MPEG-TS segments, encoder fallback h264_nvenc → libx264 → libopenh264
- [x] Thumbnail step
- [x] Sprite step (10x10 grid + WebVTT cues)
- [x] Caption extraction step (embedded streams to .vtt)
- [x] Chapter extraction step (ffprobe + description regex parse)
- [x] Finalise step (status → ready, variant rows, view count seed)
- [x] tRPC `video.uploadStatus` for client polling
- [x] Verified: `curl -F file=@... -H "Authorization: Bearer vid_..."` end-to-end

## M4 — HLS streaming endpoints

- [x] HMAC sign / verify util in `lib/hls/sign.ts`
- [x] Range parser in `lib/hls/range.ts`
- [x] Master + variant playlist URL rewriter in `lib/hls/playlist.ts`
- [x] Privacy decision tree in `lib/hls/access.ts`
- [x] `GET /api/hls/[videoId]/master.m3u8`
- [x] `GET /api/hls/[videoId]/[variant]/playlist.m3u8`
- [x] `GET /api/hls/[videoId]/[variant]/[segment]` with Range support
- [x] `GET /api/hls/[videoId]/captions/[lang].vtt`
- [x] `GET /api/hls/[videoId]/thumb/sprite.{jpg,vtt}`
- [x] Cache-Control: immutable for segments, `no-store` for private playlists, `max-age=60` for public playlists
- [x] Verified: master 200, segment 206 with `Content-Range`, anti-traversal regex on segment names

## M5 — Watch page + custom Vidstack player

- [x] `/watch/[videoId]` server component
- [x] `Player` client component using Vidstack headless API (no DefaultVideoLayout)
- [x] Glass-blur top and bottom bars with `data-active` fade-on-idle
- [x] BigPlayPause centre stage with pulse-on-hover
- [x] ChapterTrack scrubber with chapter gaps
- [x] ScrubberPreview floating thumbnail and chapter title
- [x] Settings menu (Quality, Speed, Stats for nerds)
- [x] Captions menu wired to `<Captions>`
- [x] Up Next overlay for last 10 s
- [x] Theatre / Fullscreen / Miniplayer / PiP buttons
- [x] Keyboard shortcuts (space / J / K / L / 0–9 / M / F / T / I / C / arrows / `<` `>`)
- [x] Watch progress beacon (every 5 s + on pause + on unmount, sendBeacon)
- [x] Resume-on-load with toast and Restart button
- [x] Verified: video plays, scrubs, chapters, captions, quality switch, autoplay-next, resume

## M6 — Social

- [x] `subscriptions`, `video_likes`, `comments`, `comment_likes` schema
- [x] tRPC `subscription`, `like`, `comment` routers
- [x] CommentTree component (one-level threaded)
- [x] Pin / heart / 15-min edit window / soft-delete
- [x] Counts updated transactionally
- [x] Description timestamp auto-link component
- [x] comment.create rewritten to insert+update transaction (CTE-and-update did not survive postgres-js's RowList shape)
- [x] Verified: subscribe, like/dislike toggle exclusivity, comment, reply (one level)

## M7 — Library (queue, watch later, playlists, history)

- [x] `playlists`, `playlist_items` schema with `kind` discriminator
- [x] `watch_history`, `watch_progress` schema
- [x] tRPC `playlist`, `history` routers (with queue and watchLater sub-namespaces)
- [x] `/library`, `/playlist/[id]`, `/history`, `/c/[handle]`, `/subscriptions` pages
- [x] Channel header, tabs (Videos / Playlists / About via `?tab=`)
- [x] Library sections (Up Next / Continue Watching / Watch Later / Playlists / Recent / Subs)
- [x] Verified: queue add/list, watch later visible only in library, history records on watch

## M8 — Search

- [x] tsvector + GIN index on videos
- [x] pg_trgm index on title
- [x] tRPC `search` router (videos, autocomplete, all)
- [x] Filters: date / duration / has-captions
- [x] `/search` page and nav-bar autocomplete
- [x] Verified: query returns ranked results, autocomplete debounced, private/unlisted excluded

## M9 — Notifications + polish + Docker

- [x] `notifications` schema (already in M2 schema bundle)
- [x] `notificationRouter` (list, unreadCount, markRead, markAllRead)
- [x] `lib/notifications/fanout.ts` helpers (notifyNewUpload + notifyCommentReply, best-effort)
- [x] Worker finalise step calls notifyNewUpload
- [x] comment.create reply path calls notifyCommentReply
- [x] `<NotificationBell>` in `AppHeader` (60 s polling, badge, mark-all-read, click-marks-row-read)
- [x] error.tsx + global-error.tsx + not-found.tsx
- [x] /api/health REST endpoint
- [x] Auto-migrations on container boot via `scripts/migrate.ts` (esbuild-bundled)
- [x] Docker entrypoint runs migrator before `node server.js`
- [x] `drizzle/0000_flowery_pretty_boy.sql` baked into runner image
- [x] Verified: `docker compose --profile full up -d` against fresh DB, full smoke against containerised app

## End-to-end verification

- [x] `scripts/smoke.sh` passes against `yarn dev`
- [x] `scripts/smoke.sh` passes against the production Docker stack
- [x] `yarn typecheck` clean
- [x] `yarn lint` clean (a handful of `<img>` warnings on player thumbnails left for a polish pass)
- [x] `yarn build` clean (22 routes)
- [x] `yarn test` 5 files, 74 tests green

## Post-M9 polish (shipped)

- [x] Studio video table at `/studio/c/[handle]/videos` (edit metadata / set privacy / delete / copy link)
- [x] Studio upload form at `/studio/c/[handle]/upload` with two-stage progress (XHR upload + transcode poll)
- [x] `video.delete` cleans up source + HLS + sidecar files via `lib/cleanup.ts`
- [x] Captions-upload-after-the-fact at `POST /api/upload/[videoId]/captions`
- [x] Channel customisation at `/studio/c/[handle]/customise` (avatar + banner + name + description)
- [x] Avatar / banner endpoint `POST /api/channel/[id]/asset` (magic-byte validated, atomic rename)
- [x] Asset GET at `/api/channel/[id]/asset/[kind]` (extension-agnostic)
- [x] Search by **channels** and **playlists** tabs (`?tab=channels|playlists`)
- [x] Add-to-playlist menu on every `VideoCard` (queue / watch later / user playlists / new)
- [x] Share button on `/watch` with link copy AND iframe embed snippet
- [x] `/embed/[videoId]` server-rendered page for `<iframe>` embedding
- [x] `/settings` stub with sign-out
- [x] Continue Watching uses `incompleteOnly` filter joined with `watchProgress`
- [x] All `<img>` swapped to `next/image` in player and up-next surfaces
- [x] Notification bell with 60 s polling, unread badge, mark-all-read, item links
- [x] `notifyNewUpload` wired into worker finalise; `notifyCommentReply` wired into comment.create
- [x] Real `/home` feed: subscriptions + trending (HN-style gravity decay) + recently uploaded
- [x] `video.trending` procedure with `view_count / pow(age_hours + 2, 1.5)` score
- [x] CommentTree wired into the watch page (no longer a placeholder)
- [x] Migrate retry-with-backoff for docker cold-start DNS race
- [x] `scripts/janitor.ts` for orphan media cleanup (`just janitor`, `just janitor-apply`)
- [x] `docs/operator-api.md` documenting upload + caption + asset endpoints + tRPC summary
- [x] `/api/health` REST endpoint
- [x] `error.tsx`, `global-error.tsx`, `not-found.tsx` cassette-styled
- [x] `404 -> /` link uses `<Link>` instead of `<a>` (lint clean)

## Post-M9 QoL Wave 1 (shipped)

- [x] Player localStorage prefs (volume, playback rate, captions lang, theatre)
- [x] Keyboard shortcut overlay (`?` opens a Dialog listing every shortcut)
- [x] Watch progress beacon skips when signed-out (no anonymous POSTs)
- [x] Optimistic UI on subscribe / like / queue.add / watchLater.add (with rollback)
- [x] Comment list skeletons
- [x] Subscriber count refreshes after subscribe / unsubscribe
- [x] Web Share API on mobile (≤ 768 px) bypasses the Popover
- [x] Tab title shows playing video; bell prepends `(N) ` when unread
- [x] Comment timestamp links seek the player (shared `lib/timestamps.ts`)
- [x] Pinned comment scrolls into view when URL hash is `#comments`
- [x] Bulk video upload at `/studio/c/<handle>/upload` with N=2 concurrency
- [x] Thumbnail picker (10×10 sprite-grid → ffmpeg single-frame extract)
- [x] HTML5 drag-reorder for playlists and the queue
- [x] AddToPlaylist + AddToWatchLater on the watch action row
- [x] Admin pages: `/admin` (overview), `/admin/users`, `/admin/users/[id]`, `/admin/videos`, `/admin/storage`, `/admin/jobs`, `/admin/settings`
- [x] `adminProcedure` middleware joining `admin_grants`
- [x] `admin_grants` schema; `seed-admin` grants the bootstrap user

## Post-M9 QoL Wave 2 (shipped)

- [x] Webhooks: `webhooks` + `webhook_deliveries` schema
- [x] HMAC-signed delivery (`X-Cassette-Signature: sha256=<hex>`)
- [x] Worker fires `transcode.completed` + `transcode.failed`
- [x] `comment.create` fires `comment.created`
- [x] `/studio/c/<handle>/webhooks` management UI (CRUD + test fire + rotate + deliveries log)
- [x] In-memory rate limiter on `/api/auth/*`, `/api/upload`, `comment.create`
- [x] RSS feed at `/c/<handle>/feed.xml` (50 most-recent public videos, max-age=300)
- [x] Channel head exposes `<link rel="alternate" type="application/rss+xml">`
- [x] Video tags (text[] GIN-indexed) + tags UI in upload + edit dialog + search filter
- [x] `<TagChipRow>` on the watch page below the title
- [x] Structured logger in `src/lib/log.ts` (no new deps; JSON via `LOG_FORMAT=json`)
- [x] `scripts/backup.sh` + `scripts/restore.sh` (`just backup`, `just restore <dir>`)
- [x] Operator API doc updated with webhooks / RSS / tags / rate limits

## Post-M9 QoL Wave 3 (shipped)

- [x] Email password reset with `lib/mail.ts` helper (nodemailer when `SMTP_URL`, stdout fallback otherwise)
- [x] `/forgot-password` and `/reset-password` pages
- [x] Change-password form on `/settings` (revokes other sessions on success)
- [x] Active sessions panel on `/settings` with per-row revoke + revoke-all-others
- [x] `accountRouter` with `listSessions` / `revokeSession` / `revokeAllOtherSessions`
- [x] Playwright e2e: 8 specs across health, search, auth (`yarn e2e`, `just e2e`)
- [ ] Passkeys / WebAuthn — DEFERRED. Better-Auth 1.6 has no passkey plugin and `@better-auth/passkey` is not on npm. Revisit when upstream lands it.
- [ ] Watch + upload Playwright spec — DEFERRED. Bash smoke covers the path; Playwright upload spec lands when there's a clear UX regression budget for it.

## Codex review

- [ ] Codex sign-off on the implementation
