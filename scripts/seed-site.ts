#!/usr/bin/env tsx
import postgres from "postgres";
import { config } from "@/lib/load-env";

config();

const main = async () => {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    await sql`INSERT INTO site_config (id, privacy_mode) VALUES (1, 'public') ON CONFLICT (id) DO NOTHING`;
    console.log("bootstrap row inserted");
    await sql.end();
};

main().catch(console.error);
