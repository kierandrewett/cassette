# cassette task runner. Run `just` to see all recipes.
#
# Conventions:
#   - yarn for JS package operations
#   - docker compose for the database (service: db) and full stack (profile: full)
#   - drizzle-kit via yarn db:* for schema work

set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# ---------------------------------------------------------------------------
# Dependencies and bootstrap
# ---------------------------------------------------------------------------

install:
    yarn install

bootstrap: install db-up db-wait db-push

# ---------------------------------------------------------------------------
# Local development
# ---------------------------------------------------------------------------

dev:
    yarn dev

build:
    yarn build

start:
    yarn start

typecheck:
    yarn typecheck

lint:
    yarn lint

format:
    yarn format

format-check:
    yarn format:check

test:
    yarn test

# ---------------------------------------------------------------------------
# Database (Postgres in docker compose, schema via drizzle-kit)
# ---------------------------------------------------------------------------

db-up:
    docker compose up -d db

db-down:
    docker compose stop db

db-reset:
    docker compose down -v
    docker compose up -d db

db-wait:
    until docker compose exec -T db pg_isready -U cassette -d cassette > /dev/null 2>&1; do sleep 1; done

db-push:
    yarn db:push

db-generate:
    yarn db:generate

db-studio:
    yarn db:studio

db-shell:
    docker compose exec -it db psql -U cassette -d cassette

# ---------------------------------------------------------------------------
# Full stack (app + db) via docker compose
# ---------------------------------------------------------------------------

stack-build:
    docker compose --profile full build

stack-up:
    docker compose --profile full up -d

stack-down:
    docker compose --profile full down

stack-logs:
    docker compose --profile full logs -f

# ---------------------------------------------------------------------------
# E2E smoke flow
# ---------------------------------------------------------------------------

smoke:
    bash scripts/smoke.sh

# Run the Playwright e2e suite. Assumes a running cassette stack at
# E2E_BASE_URL (default http://localhost:3000). Use `just stack-up` first.
e2e:
    yarn e2e

# Open the Playwright UI runner.
e2e-ui:
    yarn e2e:ui

# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

# Dry-run the orphan-file janitor.
janitor:
    yarn tsx scripts/janitor.ts

# Actually apply the cleanup (deletes orphan files and HLS dirs).
janitor-apply:
    yarn tsx scripts/janitor.ts --apply

# Snapshot the database + media to ./backups/<UTC-timestamp>.
backup:
    bash scripts/backup.sh

# Restore from a backup directory. Pass --yes to skip the confirm prompt.
restore dir *args:
    bash scripts/restore.sh {{dir}} {{args}}
