# cassette operator API

The operator-facing surface of cassette is small on purpose. Everything you
need to integrate with another service (a yt-dlp pipeline, a NAS importer,
an arr-stack post-processor) goes through three endpoints plus the existing
HLS streaming routes.

This document describes those endpoints, the auth model, and the smallest
working examples you can copy.

---

## Authentication

cassette has two auth paths, both proven by the end-to-end smoke test:

1. **Channel-scoped API keys** for service-to-service uploads. Mint one in
   the studio at `/studio/channel/<handle>/api-keys`. The plaintext is shown
   exactly once. Format: `vid_<22-char-base64url>`.

2. **Better-Auth session cookie** for browser users. Used by the studio
   upload form, the comment composer, the like button, and the bell.

Both paths are accepted by the upload and caption endpoints. Pick whichever
fits your client. API keys cannot like or comment — they are upload-only.

---

## POST /api/upload

Upload a video to a channel. The transcode pipeline picks it up
automatically; poll `video.uploadStatus` to follow progress.

### Request

`Content-Type: multipart/form-data`

| Field         | Required | Description                                           |
| ------------- | -------- | ----------------------------------------------------- |
| `file`        | yes      | The video file. ≤ `MAX_UPLOAD_BYTES` (default 20 GB). |
| `title`       | yes\*    | ≤ 200 characters.                                     |
| `description` | no       | ≤ 10,000 characters.                                  |
| `privacy`     | no       | `public` (default), `unlisted`, or `private`.         |
| `channelId`   | session  | Required when using session auth, ignored otherwise.  |
| `captions[]`  | no       | One or more `<lang>-<Label>.vtt` files.               |
| `info[]`      | no       | yt-dlp `.info.json` sidecar (≤ 1 MB).                 |

\* `title` is optional when `info[]` is provided AND the sidecar contains a
`title`; otherwise the upload is rejected with 400.

API key auth: `Authorization: Bearer vid_<your-key>`.

### Example

```bash
curl -fsS \
  -H "Authorization: Bearer vid_xxxxxxxxxxxxxxxxxxxxxx" \
  -F file=@/media/imports/holiday.mp4 \
  -F title="Holiday 2026" \
  -F description="Day one." \
  -F privacy=unlisted \
  -F captions[]=@/media/imports/holiday.en-English.vtt \
  https://cassette.example/api/upload
```

### yt-dlp `.info.json` ingestion

Pass the sidecar yt-dlp emits next to the video as `info[]`. cassette parses
it server-side BEFORE inserting the videos row and uses it to backfill
`title`, `description`, `tags` (yt-dlp's `tags` array, lowercased and
slugified, capped at 12 entries), `publishedAt` (from `release_date` →
`upload_date` → `timestamp`) and `chapters` (from `chapters[].start_time`
/ `end_time` / `title`). Explicit form fields always win, so you can mix
and match.

```bash
yt-dlp --write-info-json -o '%(id)s.%(ext)s' 'https://...'

curl -fsS \
  -H "Authorization: Bearer vid_xxxxxxxxxxxxxxxxxxxxxx" \
  -F file=@dQw4w9WgXcQ.mp4 \
  -F info[]=@dQw4w9WgXcQ.info.json \
  -F privacy=unlisted \
  https://cassette.example/api/upload
```

When chapters are present in the sidecar, the transcode worker leaves
them alone (it would otherwise re-derive them from the description /
container). Expected size: ≤ 1 MB.

### Response

`201 Created`

```json
{
    "videoId": "uuid",
    "status": "queued",
    "statusUrl": "/api/trpc/video.uploadStatus?input=...",
    "watchUrl": "/watch/<id>"
}
```

### Errors

| Code | Reason                                                |
| ---- | ----------------------------------------------------- |
| 401  | Missing / invalid / revoked API key, no session.      |
| 403  | Session is not a member of `channelId`.               |
| 404  | `channelId` does not match a channel.                 |
| 413  | File exceeds `MAX_UPLOAD_BYTES`.                      |
| 400  | Missing title, malformed multipart, no body, etc.     |

---

## POST /api/upload/[videoId]/captions

Add a caption track to a video that is already transcoded. Useful for
translations or for tracks the embedded-subtitle extractor missed.

### Request

`Content-Type: multipart/form-data`

| Field       | Required | Description                                     |
| ----------- | -------- | ----------------------------------------------- |
| `file`      | yes      | A WebVTT file. Must start with the `WEBVTT` magic line. ≤ 5 MB. |
| `lang`      | yes      | BCP-47 tag, e.g. `en` or `en-GB`.               |
| `label`     | no       | Display label. Defaults to `lang`.              |
| `isDefault` | no       | `"true"` to mark as the default track.          |

Auth: same dual path as `/api/upload`. API keys must be scoped to the
video's channel.

### Example

```bash
curl -fsS \
  -H "Authorization: Bearer vid_xxxxxxxxxxxxxxxxxxxxxx" \
  -F file=@de-Deutsch.vtt \
  -F lang=de \
  -F label=Deutsch \
  -F isDefault=false \
  https://cassette.example/api/upload/<videoId>/captions
```

### Response

`201 Created`

```json
{
    "ok": true,
    "lang": "de",
    "label": "Deutsch",
    "isDefault": false,
    "url": "/api/hls/<videoId>/captions/de.vtt"
}
```

---

## POST /api/channel/[channelId]/asset

Upload an avatar or banner for a channel.

### Request

| Field   | Required | Description                          |
| ------- | -------- | ------------------------------------ |
| `kind`  | yes      | `"avatar"` or `"banner"`.            |
| `file`  | yes      | JPEG, PNG, or WebP. Magic-byte validated. Avatar ≤ 5 MB, banner ≤ 10 MB. |

Auth: session with owner / manager role on the channel, OR a vid\_ key
scoped to the same channel.

### Response

`200 OK`

```json
{ "ok": true, "url": "/api/channel/<channelId>/asset/avatar" }
```

The serving URL is extension-agnostic; the asset GET route probes
`<kind>.webp → .jpg → .png` so the operator never has to update the
public URL when replacing a file.

---

## tRPC

Everything else is tRPC at `/api/trpc/<namespace>.<procedure>`. The full
type-safe surface is in `src/server/api/routers/`. The studio uses these
exclusively. A few are useful to call from external automation:

| Procedure                 | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `health.ping`             | Liveness probe.                                    |
| `video.uploadStatus`      | Poll transcode state for a given videoId.          |
| `video.byId`              | Fetch the full video + variants + captions + chapters. |
| `channel.byHandle`        | Look up a channel by `@handle`.                    |
| `channel.generateApiKey`  | Mint a key. Plaintext is returned exactly once.    |
| `channel.revokeApiKey`    | Revoke a key (sets `revokedAt = now()`).           |
| `search.videos`           | Full-text search with filters.                     |
| `search.channels`         | Channel name / handle similarity search.           |

GET requests use `?input=<urlencoded JSON>`; POST requests carry the
JSON in the body. The tRPC wire format wraps inputs in `{"json": ...}`.

---

## Webhooks

Channel-scoped outbound webhooks fire HMAC-signed POSTs whenever an event
happens on any video belonging to the channel.

### Subscribed events

| Event                  | Fired by                                     |
| ---------------------- | -------------------------------------------- |
| `transcode.completed`  | Worker finalise step                         |
| `transcode.failed`     | Worker failure path                          |
| `comment.created`      | `comment.create` after a successful insert   |

### Headers

```
X-Cassette-Event:     <event-name>
X-Cassette-Signature: sha256=<hmac-hex>
X-Cassette-Delivery:  <uuid>
Content-Type:         application/json
```

The signature is `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")`.
Verify on the receiver before trusting the payload.

### Payload (transcode events)

```json
{
    "event": "transcode.completed",
    "videoId": "uuid",
    "channelId": "uuid",
    "title": "...",
    "publishedAt": "ISO timestamp"
}
```

### Manage webhooks

`/studio/channel/<handle>/webhooks` — create, edit, rotate secret, test fire,
delete, view delivery history. Plaintext secret is shown exactly once on
create + rotate.

---

## RSS feed per channel

`GET /channel/<handle>/feed.xml` returns a valid RSS 2.0 feed of the channel's
50 most-recent public+ready videos. Cache-Control: `public, max-age=300`.
Channel pages set `<link rel="alternate" type="application/rss+xml">` so
feed-reader apps autodiscover.

---

## Tags

Videos can carry up to 12 free-form tags (lowercase `[a-z0-9-]+`,
≤ 30 chars each). Set them on upload with the `tags` form field
(comma-separated string), edit later via `video.updateMetadata`, browse
via `/search?tag=<tag>`. Tags appear as clickable chips on the watch page.

---

## Rate limits

In-memory token-bucket limits (per-process; restart resets):

| Route                | Limit                                           |
| -------------------- | ----------------------------------------------- |
| `POST /api/auth/*`   | 10/minute per IP                                |
| `POST /api/upload`   | 12/hour for session callers, 60/hour for keys   |
| `comment.create`     | 30/minute per user                              |

429 responses include `Retry-After` in seconds.

---

## Embed

Any public or unlisted video can be embedded with an `<iframe>`:

```html
<iframe
    src="https://cassette.example/embed/<videoId>"
    width="640" height="360" frameborder="0"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen></iframe>
```

For unlisted videos, append `?slug=<unlistedSlug>`. Private videos cannot
be embedded — playback always requires a signed-in channel member.

---

## Security headers

cassette ships a tight default `Content-Security-Policy` plus the standard
hardening headers (`X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options`). They are applied via Next.js'
`headers()` config so they cover every route.

| Header                         | Default                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | `default-src 'self'; media-src 'self' blob:; img-src 'self' data: libravatar/gravatar; connect-src 'self'; style/script 'self' 'unsafe-inline'; frame-ancestors 'self'` |
| `Strict-Transport-Security`    | off by default; set `ENABLE_HSTS=1` once you confirm HTTPS is correct           |
| `X-Frame-Options`              | `SAMEORIGIN` (dropped for `/embed/**`)                                          |
| `X-Content-Type-Options`       | `nosniff`                                                                       |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                                               |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=(), interest-cohort=()`                  |

`/embed/**` overrides `frame-ancestors` to `*` and drops `X-Frame-Options`
so cassette videos can be embedded on third-party sites. If you want to
restrict embedding to specific origins (e.g. only your company wiki),
set CSP at your reverse proxy for that path — proxy headers always win
over the inner Next.js layer. PWA assets (`/manifest.webmanifest`,
`/sw.js`) inherit the default CSP and no further configuration is needed.

---

## PWA / Lockscreen

cassette is installable as a PWA: `/manifest.webmanifest` is generated by
Next.js, the service worker at `/sw.js` precaches the app shell, and the
W3C Media Session API surfaces metadata to the OS lockscreen. The service
worker is strictly network-only for `/api/**` and HLS segments — auth
tokens never enter the cache. To replace the default icons, drop PNGs
at `public/icon-192.png` and `public/icon-512.png`.

---

## Observability

cassette supports optional error capture via [Sentry](https://sentry.io). When `SENTRY_DSN` is set in the environment, exceptions from the transcode worker, the transcribe worker, the auto-prune cron, and the upload route are forwarded to Sentry automatically. When the variable is absent the integration is a complete no-op and the package does not need to be installed.

**Setup:**

```bash
yarn add @sentry/nextjs          # install the package
SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/YYY  # add to .env / docker-compose
```

No other configuration is required. The DSN is the only supported setting; all other Sentry options use their defaults.

---

## End-to-end smoke

`scripts/smoke.sh` is the executable contract for these endpoints. It
covers sign-up → channel.create → channel.generateApiKey → /api/upload →
transcode polling → master.m3u8 + variant + segment Range → /watch →
subscribe → like → comment → queue.add → watchLater.add → search.videos →
recordProgress → notification.unreadCount.

Run it with `just smoke` or `BASE_URL=http://other-host:3000 bash
scripts/smoke.sh`.
