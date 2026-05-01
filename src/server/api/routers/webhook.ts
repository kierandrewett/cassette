import { randomBytes } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { deliverWebhook } from "@/lib/webhooks/deliver";
import { createTRPCRouter, channelProcedure, protectedProcedure } from "@/server/api/trpc";
import { webhookDeliveries, webhooks } from "@/server/db/schema/webhooks";
import type { WebhookEvent } from "@/server/db/schema/webhooks";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_EVENTS: WebhookEvent[] = ["transcode.completed", "transcode.failed", "comment.created"];

const ALLOWED_EVENTS_SET = new Set<string>(ALLOWED_EVENTS);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateSecret = (): string => randomBytes(32).toString("hex");

/** Redact the secret: show only the first 8 chars followed by "…". */
const redactSecret = (secret: string): string => secret.slice(0, 8) + "…";

/** Strip the full secret from a webhook row before returning to the client. */
const redactWebhook = (row: typeof webhooks.$inferSelect) => ({
    ...row,
    secret: redactSecret(row.secret),
});

/** Resolve a webhook that belongs to the caller's channel, or throw NOT_FOUND. */
const resolveWebhookForChannel = async (
    db: Parameters<Parameters<ReturnType<typeof channelProcedure>["mutation"]>[0]>[0]["ctx"]["db"],
    webhookId: string,
    channelId: string,
) => {
    const rows = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.channelId, channelId)))
        .limit(1);
    const row = rows[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found." });
    return row;
};

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const listInput = z.object({ channelId: z.string().uuid() });

const byIdInput = z.object({
    channelId: z.string().uuid(),
    webhookId: z.string().uuid(),
});

const createInput = z.object({
    channelId: z.string().uuid(),
    name: z.string().min(1).max(120),
    url: z
        .string()
        .url()
        .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
            message: "URL must use http or https.",
        }),
    events: z
        .array(z.string())
        .min(1, "At least one event is required.")
        .refine((evs) => evs.every((e) => ALLOWED_EVENTS_SET.has(e)), {
            message: `Events must be a subset of: ${ALLOWED_EVENTS.join(", ")}.`,
        }),
});

const updateInput = z.object({
    channelId: z.string().uuid(),
    webhookId: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    url: z
        .string()
        .url()
        .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
            message: "URL must use http or https.",
        })
        .optional(),
    events: z
        .array(z.string())
        .min(1)
        .refine((evs) => evs.every((e) => ALLOWED_EVENTS_SET.has(e)), {
            message: `Events must be a subset of: ${ALLOWED_EVENTS.join(", ")}.`,
        })
        .optional(),
    enabled: z.boolean().optional(),
});

const rotateSecretInput = z.object({
    channelId: z.string().uuid(),
    webhookId: z.string().uuid(),
});

const deleteInput = z.object({
    channelId: z.string().uuid(),
    webhookId: z.string().uuid(),
});

const deliveriesInput = z.object({
    channelId: z.string().uuid(),
    webhookId: z.string().uuid(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().uuid().optional(),
});

const testFireInput = z.object({
    channelId: z.string().uuid(),
    webhookId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const webhookRouter = createTRPCRouter({
    /** List all webhooks for a channel. Secrets are redacted. */
    list: channelProcedure("owner", "manager")
        .input(listInput)
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select()
                .from(webhooks)
                .where(eq(webhooks.channelId, input.channelId))
                .orderBy(desc(webhooks.createdAt));
            return rows.map(redactWebhook);
        }),

    /** Get a single webhook. Secret is redacted. */
    byId: channelProcedure("owner", "manager")
        .input(byIdInput)
        .query(async ({ ctx, input }) => {
            const row = await resolveWebhookForChannel(ctx.db, input.webhookId, input.channelId);
            return redactWebhook(row);
        }),

    /**
     * Create a new webhook. Returns the row (redacted) plus the plaintext
     * secret — shown exactly once.
     */
    create: channelProcedure("owner", "manager")
        .input(createInput)
        .mutation(async ({ ctx, input }) => {
            const secret = generateSecret();

            const inserted = await ctx.db
                .insert(webhooks)
                .values({
                    channelId: input.channelId,
                    createdById: ctx.user.id,
                    name: input.name,
                    url: input.url,
                    secret,
                    events: input.events,
                    enabled: true,
                })
                .returning();

            const row = inserted[0];
            if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create webhook." });

            return { ...redactWebhook(row), plaintextSecret: secret };
        }),

    /** Update webhook fields. */
    update: channelProcedure("owner", "manager")
        .input(updateInput)
        .mutation(async ({ ctx, input }) => {
            await resolveWebhookForChannel(ctx.db, input.webhookId, input.channelId);

            const set: Partial<typeof webhooks.$inferInsert> = { updatedAt: new Date() };
            if (input.name !== undefined) set.name = input.name;
            if (input.url !== undefined) set.url = input.url;
            if (input.events !== undefined) set.events = input.events;
            if (input.enabled !== undefined) set.enabled = input.enabled;

            const updated = await ctx.db
                .update(webhooks)
                .set(set)
                .where(and(eq(webhooks.id, input.webhookId), eq(webhooks.channelId, input.channelId)))
                .returning();

            return redactWebhook(updated[0]!);
        }),

    /**
     * Generate a new secret for an existing webhook. Returns the row (redacted)
     * plus the new plaintext secret — shown exactly once.
     */
    rotateSecret: channelProcedure("owner", "manager")
        .input(rotateSecretInput)
        .mutation(async ({ ctx, input }) => {
            await resolveWebhookForChannel(ctx.db, input.webhookId, input.channelId);

            const newSecret = generateSecret();

            const updated = await ctx.db
                .update(webhooks)
                .set({ secret: newSecret, updatedAt: new Date() })
                .where(and(eq(webhooks.id, input.webhookId), eq(webhooks.channelId, input.channelId)))
                .returning();

            return { ...redactWebhook(updated[0]!), plaintextSecret: newSecret };
        }),

    /** Delete a webhook and all its delivery history (cascade). */
    delete: channelProcedure("owner", "manager")
        .input(deleteInput)
        .mutation(async ({ ctx, input }) => {
            await resolveWebhookForChannel(ctx.db, input.webhookId, input.channelId);

            await ctx.db
                .delete(webhooks)
                .where(and(eq(webhooks.id, input.webhookId), eq(webhooks.channelId, input.channelId)));

            return { success: true };
        }),

    /** Recent delivery rows for a webhook, newest first. */
    deliveries: channelProcedure("owner", "manager")
        .input(deliveriesInput)
        .query(async ({ ctx, input }) => {
            await resolveWebhookForChannel(ctx.db, input.webhookId, input.channelId);

            const rows = await ctx.db
                .select()
                .from(webhookDeliveries)
                .where(eq(webhookDeliveries.webhookId, input.webhookId))
                .orderBy(desc(webhookDeliveries.createdAt))
                .limit(input.limit);

            return rows;
        }),

    /**
     * Post a test ping to the webhook URL via the standard delivery path so
     * the user can verify reachability and check the delivery log.
     */
    testFire: protectedProcedure.input(testFireInput).mutation(async ({ ctx, input }) => {
        // Verify the caller is a member with the right role.
        const { channelMembers } = await import("@/server/db/schema/channels");
        const memberRows = await ctx.db
            .select({ role: channelMembers.role })
            .from(channelMembers)
            .where(and(eq(channelMembers.channelId, input.channelId), eq(channelMembers.userId, ctx.user.id)))
            .limit(1);

        const member = memberRows[0];
        if (!member || (member.role !== "owner" && member.role !== "manager")) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Owner or manager role required." });
        }

        const row = await resolveWebhookForChannel(ctx.db, input.webhookId, input.channelId);

        await deliverWebhook({
            webhookId: row.id,
            event: "test.ping",
            payload: { event: "test.ping", at: new Date().toISOString() },
        });

        return { success: true };
    }),
});
