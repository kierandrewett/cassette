import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

// admin_grants is the only place "user is an admin" is recorded. Keeping it
// in a sibling table (rather than extending the Better-Auth `user` table)
// means a Better-Auth schema regen never wipes our admin set, and an admin
// promotion is a single insert without touching the auth tables.
//
// The first admin is seeded by scripts/seed-admin.ts; subsequent grants are
// performed from /admin/users by an existing admin.
export const adminGrants = pgTable("admin_grants", {
    userId: text("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
});

export type AdminGrant = typeof adminGrants.$inferSelect;
