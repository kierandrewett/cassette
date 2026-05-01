import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { channels } from "./channels";

// Channel-scoped webhooks. The worker fires HTTP POSTs at `url` whenever an
// event in `events` happens for any video belonging to `channelId`. Payload
// is signed with HMAC-SHA256(secret, body) and sent as the
// `X-Cassette-Signature: sha256=<hex>` header.
//
// Supported event names:
//   - "transcode.completed" — fired from the worker finalise step
//   - "transcode.failed"    — fired from the worker error path
//   - "comment.created"     — fired from comment.create after insert
//
// `events` is a Postgres text[] so a webhook can subscribe to any subset.
// Empty array = no events (effectively disabled).
export const webhooks = pgTable(
    "webhooks",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        channelId: uuid("channel_id")
            .notNull()
            .references(() => channels.id, { onDelete: "cascade" }),
        createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
        name: text("name").notNull(),
        url: text("url").notNull(),
        secret: text("secret").notNull(),
        events: text("events").array().notNull().default([]),
        enabled: boolean("enabled").notNull().default(true),
        lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
        lastDeliveryStatus: text("last_delivery_status"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        channelIdx: index("webhooks_channel_idx").on(t.channelId, t.enabled),
    }),
);

// One row per delivery attempt. Useful for the studio webhook UI ("show me
// the last 50 deliveries with their status codes"). pg-boss handles retry
// scheduling so we do not duplicate retry state here.
export const webhookDeliveries = pgTable(
    "webhook_deliveries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        webhookId: uuid("webhook_id")
            .notNull()
            .references(() => webhooks.id, { onDelete: "cascade" }),
        event: text("event").notNull(),
        payload: jsonb("payload").notNull(),
        statusCode: text("status_code"),
        responseBody: text("response_body"),
        errorMessage: text("error_message"),
        deliveredAt: timestamp("delivered_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ({
        webhookIdx: index("webhook_deliveries_webhook_idx").on(t.webhookId, t.createdAt.desc()),
    }),
);

export type Webhook = typeof webhooks.$inferSelect;
export type WebhookInsert = typeof webhooks.$inferInsert;
export type WebhookEvent = "transcode.completed" | "transcode.failed" | "comment.created";
