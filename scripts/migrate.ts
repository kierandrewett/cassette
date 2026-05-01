// scripts/migrate.ts
//
// Apply Drizzle migrations and the trigger SQL to the configured database.
// Used by the docker entrypoint on app boot so the production stack is
// self-bootstrapping. Safe to re-run: drizzle stores its own migration
// journal so already-applied migrations are skipped.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { config as loadDotenv } from "../src/lib/load-env";

loadDotenv();

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
    console.error("[migrate] DATABASE_URL is required");
    process.exit(1);
}

const log = (msg: string): void => console.log(`[migrate] ${msg}`);

const main = async (): Promise<void> => {
    log(`connecting to ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`);

    const sql = postgres(databaseUrl, { max: 1 });
    const db = drizzle(sql);

    // Ensure required Postgres extensions are present before running schema
    // migrations; the schema relies on citext + pg_trgm + pgcrypto.
    log("ensuring extensions: citext, pg_trgm, pgcrypto");
    await sql`CREATE EXTENSION IF NOT EXISTS citext`;
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

    // Apply schema migrations from ./drizzle
    log("applying schema migrations from ./drizzle");
    await migrate(db, { migrationsFolder: "./drizzle" });

    // Apply triggers (custom SQL not expressible via drizzle-kit). Idempotent.
    const triggersPath = join(process.cwd(), "src/server/db/triggers.sql");
    log(`applying triggers from ${triggersPath}`);
    try {
        const triggerSql = await readFile(triggersPath, "utf8");
        // postgres-js's `unsafe` runs raw SQL with no parameters and supports
        // multi-statement scripts.
        await sql.unsafe(triggerSql);
    } catch (err) {
        // Triggers are not critical for boot; log and carry on so migrations
        // are not lost if triggers.sql moves around.
        console.warn("[migrate] could not apply triggers.sql:", err);
    }

    await sql.end({ timeout: 5 });
    log("done");
};

main().catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
});
