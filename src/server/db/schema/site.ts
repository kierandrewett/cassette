import { sql } from "drizzle-orm";
import { check, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const privacyModeEnum = pgEnum("privacy_mode", ["public", "login-required", "login-only"]);

export type PrivacyMode = (typeof privacyModeEnum.enumValues)[number];

// Single-row table. The CHECK constraint and default(1) pin it to exactly one row.
export const siteConfig = pgTable(
    "site_config",
    {
        id: integer("id").primaryKey().default(1),
        privacyMode: privacyModeEnum("privacy_mode").notNull().default("public"),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    },
    (t) => [check("site_config_single_row", sql`${t.id} = 1`)],
);

export type SiteConfig = typeof siteConfig.$inferSelect;
