import {
    type AnyPgColumn,
    boolean,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { channels } from "./channels";
import { videos } from "./videos";

export const reactionKind = pgEnum("reaction_kind", ["like", "dislike"]);

export const subscriptions = pgTable(
    "subscriptions",
    {
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        channelId: uuid("channel_id")
            .notNull()
            .references(() => channels.id, { onDelete: "cascade" }),
        notify: boolean("notify").notNull().default(true),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.userId, t.channelId] }),
        channelIdx: index("subscriptions_channel_idx").on(t.channelId),
    }),
);

export const videoLikes = pgTable(
    "video_likes",
    {
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        videoId: uuid("video_id")
            .notNull()
            .references(() => videos.id, { onDelete: "cascade" }),
        kind: reactionKind("kind").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.userId, t.videoId] }),
        videoIdx: index("video_likes_video_idx").on(t.videoId, t.kind),
    }),
);

// Threaded comments. parentId references the same table; rootId is denormalised
// to id for top-level comments and the top-level id for replies, so a single
// indexed query fetches a whole thread.
//
// Threading depth is capped at 1 in the API (a reply cannot have a reply); the
// schema does not enforce this, the comment.create procedure does.
export const comments = pgTable(
    "comments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        videoId: uuid("video_id")
            .notNull()
            .references(() => videos.id, { onDelete: "cascade" }),
        authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
        parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
        rootId: uuid("root_id"),
        body: text("body").notNull(),
        isPinned: boolean("is_pinned").notNull().default(false),
        isHearted: boolean("is_hearted").notNull().default(false),
        editedAt: timestamp("edited_at", { withTimezone: true }),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
        likeCount: integer("like_count").notNull().default(0),
        dislikeCount: integer("dislike_count").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        videoIdx: index("comments_video_idx").on(t.videoId, t.isPinned.desc(), t.createdAt.desc()),
        rootIdx: index("comments_root_idx").on(t.rootId, t.createdAt.asc()),
        parentIdx: index("comments_parent_idx").on(t.parentId),
    }),
);

export const commentLikes = pgTable(
    "comment_likes",
    {
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        commentId: uuid("comment_id")
            .notNull()
            .references(() => comments.id, { onDelete: "cascade" }),
        kind: reactionKind("kind").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.userId, t.commentId] }),
    }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type VideoLike = typeof videoLikes.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CommentLike = typeof commentLikes.$inferSelect;
export type ReactionKind = (typeof reactionKind.enumValues)[number];
