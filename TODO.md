# cassette — execution checklist

The plan lives in `PLAN.md`. This file is the live, ticked checklist. A ticked item means shippable.

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
- [x] `src/env.ts` (zod-validated)
- [x] `src/lib/utils.ts` (`cn`, `formatDuration`, `formatCount`, `formatRelativeTime`)
- [x] `src/app/{layout,page,globals.css}.tsx` rendering the cassette landing page
- [x] `docker-compose.yml` (db service + full profile)
- [x] `docker/Dockerfile` (multi-stage, ffmpeg in runner)
- [x] `docker/init-extensions.sql` (citext, pg_trgm, pgcrypto)
- [x] `Justfile` with bootstrap / dev / db / stack recipes
- [x] `README.md`, `CLAUDE.md`, `TODO.md`
- [x] `yarn install` succeeds
- [x] `yarn typecheck` passes
- [x] `yarn build` succeeds
- [x] `yarn dev` boots and `/` renders the cassette landing page

(`yarn db:push` is verified at the start of M2 once the first schema lands.)

## M2 — Auth + channels

- [ ] Drizzle schema for Better-Auth tables (`user`, `session`, `account`, `verification`, `apikey`)
- [ ] Drizzle schema for `channels`, `channel_members`
- [ ] Better-Auth server instance with Drizzle adapter and api-key plugin
- [ ] Better-Auth catch-all route handler `/api/auth/[...all]`
- [ ] tRPC context exposes `session` and `user`
- [ ] `protectedProcedure` and `channelProcedure` middlewares
- [ ] tRPC router `channel`: list, byHandle, create, update, listMine, generateApiKey, listApiKeys, revokeApiKey
- [ ] `/login` and `/register` pages with shadcn forms
- [ ] First-run seed: bootstrap admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- [ ] Verification: sign-up, sign-in, channel create, key generate (plaintext shown once), key revoke

## M3 — Upload + transcode

- [ ] Drizzle schema for `videos`, `video_variants`, `video_captions`, `video_chapters`, `transcode_jobs`
- [ ] tsvector trigger and pg_trgm index on `videos`
- [ ] `paths.ts` helper for source and HLS paths
- [ ] `POST /api/upload` route handler (multipart via busboy, API-key + session auth, channel scope check)
- [ ] pg-boss worker registered via `instrumentation.ts`
- [ ] Probe step (ffprobe metadata)
- [ ] Ladder step (drop rungs above source height)
- [ ] HLS ABR transcode step (libx264 default, NVENC opt-in)
- [ ] Thumbnail step
- [ ] Sprite step (10x10 grid + WebVTT cues)
- [ ] Caption extraction step (embedded streams to .vtt)
- [ ] Chapter extraction step (ffprobe + description regex parse)
- [ ] Finalise step (status -> ready, variant rows, view-count seed)
- [ ] tRPC `video.uploadStatus` for client polling
- [ ] Verification: `curl -F file=@... -F title=... -H "Authorization: Bearer vid_..."` succeeds end-to-end

## M4 — HLS streaming endpoints

- [ ] HMAC sign / verify util in `lib/hls/sign.ts`
- [ ] Range header parser in `lib/hls/range.ts`
- [ ] `lib/hls/playlist.ts` for master / variant playlist URL rewriting
- [ ] `GET /api/hls/[videoId]/master.m3u8` route
- [ ] `GET /api/hls/[videoId]/[variant]/playlist.m3u8` route
- [ ] `GET /api/hls/[videoId]/[variant]/[segment]` route with Range support
- [ ] `GET /api/hls/[videoId]/captions/[lang].vtt` route
- [ ] `GET /api/hls/[videoId]/thumb/sprite.{jpg,vtt}` routes
- [ ] Privacy decision tree: public allow / unlisted slug check / private signed token
- [ ] Cache-Control: immutable for segments, `no-store` for private playlists, `max-age=60` for public playlists
- [ ] Verification: `curl -I` master returns 200, segment returns 206 with `Content-Range`, private returns 401 without token

## M5 — Watch page + custom Vidstack player

- [ ] `/watch/[videoId]` server component
- [ ] `Player` client component using Vidstack headless API (no DefaultVideoLayout)
- [ ] Glass-blur top and bottom bars with `data-active` fade-on-idle behaviour
- [ ] BigPlayPause centre stage with pulse-on-hover
- [ ] ChapterTrack scrubber with chapter gaps
- [ ] ScrubberPreview floating thumbnail and chapter title
- [ ] Settings menu (Quality, Speed, Stats for nerds)
- [ ] Captions menu wired to `<Captions>`
- [ ] Up Next overlay for last 10 s
- [ ] Theatre / Fullscreen / Miniplayer / PiP buttons
- [ ] Keyboard shortcuts (space / J / K / L / 0-9 / M / F / T / I / C / arrows / `<` `>`)
- [ ] Watch progress beacon (every 5 s + on pause + on unmount, sendBeacon)
- [ ] Resume-on-load with toast and Restart button
- [ ] Verification: video plays, scrubs, chapters, captions, quality switch, autoplay-next, resume

## M6 — Social

- [ ] `subscriptions`, `video_likes`, `comments`, `comment_likes` schema
- [ ] tRPC `subscription`, `like`, `comment` routers
- [ ] CommentTree component (one-level threaded)
- [ ] Pin / heart / edit-15-min / soft-delete
- [ ] Counts updated transactionally
- [ ] Description timestamp auto-link component
- [ ] Verification: subscribe, like/dislike toggle exclusivity, comment, reply (one level), pin, heart

## M7 — Library (queue, watch later, playlists, history)

- [ ] `playlists`, `playlist_items` schema with `kind` discriminator
- [ ] `watch_history`, `watch_progress`, `view_sessions` schema
- [ ] tRPC `playlist`, `history` routers (with queue and watchLater sub-namespaces)
- [ ] `/library`, `/playlist/[id]`, `/history`, `/c/[handle]` pages
- [ ] Channel header, tabs (Videos / Playlists / About)
- [ ] Library sections (Up Next / Continue / Watch Later / Playlists / Recent / Subs)
- [ ] Verification: queue auto-advance on `ended`, watch later visible only in library, history clear/remove

## M8 — Search

- [ ] tsvector + GIN index on videos
- [ ] pg_trgm index on title and channel name
- [ ] tRPC `search` router (videos, autocomplete, all)
- [ ] Filters: date / duration / has-captions / type
- [ ] `/search` page and nav-bar autocomplete
- [ ] Verification: query returns ranked results, autocomplete debounced, private/unlisted excluded

## M9 — Notifications + polish + Docker

- [ ] `notifications` schema and tRPC `notification` router
- [ ] Bell icon with unread count
- [ ] Subscriber fan-out on transcode finalise
- [ ] Comment reply notifications
- [ ] Rate limits on hot routes
- [ ] Error pages (`error.tsx`, `not-found.tsx`)
- [ ] Production Dockerfile + compose verified
- [ ] `scripts/smoke.sh` end-to-end smoke
- [ ] README updated with the final operator flow

## Codex review

- [ ] Codex sign-off on the implementation
