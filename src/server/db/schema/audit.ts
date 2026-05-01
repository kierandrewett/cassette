import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const auditActionValues = [
    "user.promote",
    "user.demote",
    "user.delete",
    "user.signOutAll",
    "video.delete",
    "video.transcribe",
    "video.autoPrune",
    "channel.quotaSet",
    "siteConfig.set",
    "apiKey.revoke",
    "apiKey.generate",
    "transcodeJob.retry",
    "janitor.run",
] as const;

export type AuditAction = (typeof auditActionValues)[number];

export const auditTargetTypeValues = ["user", "video", "channel", "site", "apiKey", "job"] as const;

export type AuditTargetType = (typeof auditTargetTypeValues)[number];

export const auditLogs = pgTable(
    "audit_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
        action: text("action").notNull().$type<AuditAction>(),
        targetType: text("target_type").notNull().$type<AuditTargetType>(),
        targetId: text("target_id"),
        details: jsonb("details"),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index("audit_logs_created_at_idx").on(t.createdAt.desc()),
        index("audit_logs_actor_created_at_idx").on(t.actorId, t.createdAt.desc()),
    ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
