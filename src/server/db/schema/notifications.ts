import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { channels } from "./channels";
import { comments } from "./social";
import { videos } from "./videos";

export const notificationKind = pgEnum("notification_kind", ["new_upload", "comment_reply"]);

export const notifications = pgTable(
    "notifications",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        kind: notificationKind("kind").notNull(),
        videoId: uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
        channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
        commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
        readAt: timestamp("read_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        userIdx: index("notif_user_idx").on(t.userId, t.createdAt.desc()),
        unreadIdx: index("notif_unread_idx")
            .on(t.userId)
            .where(sql`read_at is null`),
    }),
);

export type Notification = typeof notifications.$inferSelect;
export type NotificationKind = (typeof notificationKind.enumValues)[number];
