-- Postgres extensions cassette relies on. Loaded by the postgres container
-- on first init via /docker-entrypoint-initdb.d.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
