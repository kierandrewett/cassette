# cassette

A self-hosted, YouTube-shaped personal video platform. Upload via a simple HTTP API, watch back as adaptive HLS, keep
the library on disk where you can see it.

## Stack

- Next.js 15 (App Router) with React 19
- TypeScript (strict)
- tRPC v11
- Drizzle ORM with Postgres 16
- Better-Auth (email + password, plus channel-scoped API keys)
- Vidstack player with hls.js
- shadcn/ui + Tailwind 3 (dark, `system-ui` typography)
- pg-boss for transcoding jobs
- ffmpeg + ffprobe for the HLS pipeline (MPEG-TS `.ts` segments, ABR ladder)

## Quick start (development)

Prerequisites: Node 22+, yarn (via corepack), Docker, ffmpeg on the host (the dev server uses the host's ffmpeg).

```bash
corepack enable
yarn install
cp .env.example .env

# bring postgres up and apply the schema
just bootstrap

# run the dev server
yarn dev
```

Open `http://localhost:3000`.

## Environment

Configuration is driven by `.env`. See `.env.example` for the full list. The most important variables:

| Variable              | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `DATABASE_URL`        | Postgres connection string                               |
| `MEDIA_SOURCE_PATH`   | Where uploaded originals are written. Bind-mount in prod |
| `MEDIA_HLS_PATH`      | Where transcoded HLS output lives. Safe to wipe          |
| `BETTER_AUTH_SECRET`  | Random 32+ byte secret used by Better-Auth               |
| `HLS_SIGNING_SECRET`  | Random 32+ byte secret for signed segment tokens         |
| `MAX_UPLOAD_BYTES`    | Hard cap for a single upload. Default 20 GiB             |
| `TRANSCODE_CONCURRENCY` | How many ffmpeg jobs run in parallel                   |
| `ENABLE_NVENC`        | Set to 1 to use h264_nvenc when available                |

## Layout

See `PLAN.md` for the full design document and milestone breakdown. See `TODO.md` for the live execution checklist.

## Self-hosting

Build the image and run via docker compose:

```bash
just stack-build
just stack-up
```

The compose file binds two host paths:

- `MEDIA_SOURCE_PATH` for uploaded originals
- `MEDIA_HLS_PATH` for transcoded HLS output

Both default to `./media/source` and `./media/hls`. Override in `.env` to point at any path on the host.

## Licence

MIT.
