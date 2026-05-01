#!/usr/bin/env bash
# scripts/backup.sh
#
# Snapshot a cassette deployment to a tarball:
#   - pg_dump of the database (custom format, gzipped)
#   - tarball of MEDIA_SOURCE_PATH (originals)
#   - tarball of MEDIA_HLS_PATH (derived assets, optional)
#
# Output dir defaults to ./backups/<UTC-timestamp>. Pass an alternate dir
# as the first argument.
#
# Restore with scripts/restore.sh.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Load .env so this works without docker compose
if [[ -f ".env" ]]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
fi

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
MEDIA_SOURCE_PATH="${MEDIA_SOURCE_PATH:-./media/source}"
MEDIA_HLS_PATH="${MEDIA_HLS_PATH:-./media/hls}"
INCLUDE_HLS="${INCLUDE_HLS:-1}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_dir="${1:-${ROOT_DIR}/backups/${ts}}"
mkdir -p "$out_dir"

log() { printf "\033[36m[backup]\033[0m %s\n" "$*"; }

# ---------------------------------------------------------------------------
# 1. database
# ---------------------------------------------------------------------------
log "pg_dump -> $out_dir/db.sql.gz"
if command -v pg_dump > /dev/null 2>&1; then
    pg_dump --no-owner --no-acl --format=plain "$DATABASE_URL" | gzip > "$out_dir/db.sql.gz"
elif docker compose ps db --status running > /dev/null 2>&1; then
    log "pg_dump not on host; using `docker compose exec db pg_dump`"
    docker compose exec -T db pg_dump --no-owner --no-acl --format=plain -U cassette cassette | gzip > "$out_dir/db.sql.gz"
else
    echo "[backup FAIL] no pg_dump on PATH and no `db` service running" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# 2. originals (always)
# ---------------------------------------------------------------------------
if [[ -d "$MEDIA_SOURCE_PATH" ]]; then
    log "tar -> $out_dir/source.tar.gz ($MEDIA_SOURCE_PATH)"
    tar -C "$(dirname "$MEDIA_SOURCE_PATH")" -czf "$out_dir/source.tar.gz" "$(basename "$MEDIA_SOURCE_PATH")"
else
    log "MEDIA_SOURCE_PATH does not exist; skipping source tarball"
fi

# ---------------------------------------------------------------------------
# 3. HLS-derived (optional, regenerable)
# ---------------------------------------------------------------------------
if [[ "$INCLUDE_HLS" == "1" && -d "$MEDIA_HLS_PATH" ]]; then
    log "tar -> $out_dir/hls.tar.gz ($MEDIA_HLS_PATH)"
    tar -C "$(dirname "$MEDIA_HLS_PATH")" -czf "$out_dir/hls.tar.gz" "$(basename "$MEDIA_HLS_PATH")"
else
    log "skipping HLS tarball (INCLUDE_HLS=$INCLUDE_HLS)"
fi

# ---------------------------------------------------------------------------
# 4. manifest
# ---------------------------------------------------------------------------
{
    echo "cassette backup"
    echo "  ts: $ts"
    echo "  database: $(echo "$DATABASE_URL" | sed -E 's,([^:]+://[^:]+:)[^@]+(@.*),\1***\2,')"
    echo "  source: $MEDIA_SOURCE_PATH"
    echo "  hls: $MEDIA_HLS_PATH"
    echo "  include_hls: $INCLUDE_HLS"
} > "$out_dir/manifest.txt"

log "done -> $out_dir"
ls -lah "$out_dir"
