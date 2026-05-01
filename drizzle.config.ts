import { defineConfig } from "drizzle-kit";
import { config as loadDotenv } from "./src/lib/load-env";

loadDotenv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for drizzle-kit");
}

export default defineConfig({
    out: "./drizzle",
    schema: "./src/server/db/schema/index.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: databaseUrl,
    },
    casing: "snake_case",
    verbose: true,
    strict: true,
});
