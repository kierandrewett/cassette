#!/usr/bin/env tsx
/**
 * First-run admin seed.
 *
 * Creates a Better-Auth user from ADMIN_EMAIL / ADMIN_PASSWORD if the `user`
 * table is empty. Re-running when a user already exists is a safe no-op.
 *
 * Run with:
 *   yarn tsx scripts/seed-admin.ts
 *
 * Environment variables are loaded from .env automatically via load-env.ts.
 */

import { config } from "@/lib/load-env";

config();

// Import env after loading .env so the zod validation sees the values.
const { env } = await import("@/env");
const { auth } = await import("@/lib/auth");
const { db } = await import("@/server/db/client");
const { user } = await import("@/server/db/schema/auth");
const { adminGrants } = await import("@/server/db/schema/admin");

const main = async () => {
    const adminEmail = env.ADMIN_EMAIL;
    const adminPassword = env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
        console.error("[seed-admin] ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env — aborting.");
        process.exit(1);
    }

    // Check whether any user exists. If so, skip.
    const existing = await db.select({ id: user.id }).from(user).limit(1);
    if (existing.length > 0) {
        console.log("[seed-admin] Users table is not empty — skipping seed. (This is a no-op.)");
        process.exit(0);
    }

    console.log(`[seed-admin] Creating admin user: ${adminEmail}`);

    const result = await auth.api.signUpEmail({
        body: {
            name: "Admin",
            email: adminEmail,
            password: adminPassword,
        },
    });

    if (!result?.user) {
        console.error("[seed-admin] Failed to create admin user:", result);
        process.exit(1);
    }

    // Grant the bootstrap user admin. Subsequent admins are promoted from
    // /admin/users by an existing admin.
    await db
        .insert(adminGrants)
        .values({
            userId: result.user.id,
            note: "bootstrap admin (seed-admin script)",
        })
        .onConflictDoNothing();

    console.log(`[seed-admin] Admin user created and granted admin. id=${result.user.id} email=${result.user.email}`);
    process.exit(0);
};

main().catch((err: unknown) => {
    console.error("[seed-admin] Unexpected error:", err);
    process.exit(1);
});
