// Vitest setup: load .env so tests transitively importing @/env can run.
import { config as loadDotenv } from "@/lib/load-env";

loadDotenv();

// Provide non-empty defaults for tests that mount the env module before
// the .env keys are populated (e.g. CI without a .env file). These values
// are deliberately fake; tests that hit the real DB still need DATABASE_URL
// from .env.
process.env["DATABASE_URL"] ??= "postgres://test:test@localhost:5432/test";
process.env["BETTER_AUTH_SECRET"] ??= "test-secret-not-for-production-only";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";
process.env["PUBLIC_URL"] ??= "http://localhost:3000";
process.env["HLS_SIGNING_SECRET"] ??= "test-hls-secret-not-for-production-32-bytes-min";
process.env["MEDIA_SOURCE_PATH"] ??= "./media/source";
process.env["MEDIA_HLS_PATH"] ??= "./media/hls";
