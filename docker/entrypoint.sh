#!/usr/bin/env sh
# docker/entrypoint.sh
#
# Run schema migrations against $DATABASE_URL on container start, then exec
# the app server. Idempotent: drizzle-orm tracks applied migrations in its
# own journal table, and triggers.sql uses CREATE OR REPLACE / DROP IF EXISTS.

set -e

if [ -z "${DATABASE_URL:-}" ]; then
    echo "[entrypoint] DATABASE_URL is required" >&2
    exit 1
fi

echo "[entrypoint] applying migrations"
node ./scripts/migrate.cjs

echo "[entrypoint] starting app"
exec node server.js
