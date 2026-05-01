import { createHmac, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { webhookDeliveries, webhooks } from "@/server/db/schema/webhooks";
import type { WebhookEvent } from "@/server/db/schema/webhooks";

// Maximum number of response-body bytes to store.
const RESPONSE_BODY_TAIL = 2048;

// Fetch timeout in milliseconds.
const FETCH_TIMEOUT_MS = 10_000;

export type DeliverWebhookOptions = {
    webhookId: string;
    event: WebhookEvent | "test.ping";
    payload: Record<string, unknown>;
};

/**
 * Signs the JSON body with HMAC-SHA256, POSTs to the webhook URL, and records
 * the attempt in `webhook_deliveries`. Updates `webhooks.lastDeliveryAt` and
 * `lastDeliveryStatus` on every attempt.
 *
 * Best-effort: any error is logged but never rethrown.
 */
export const deliverWebhook = async (opts: DeliverWebhookOptions): Promise<void> => {
    const { webhookId, event, payload } = opts;

    try {
        // Load the webhook row.
        const rows = await db.select().from(webhooks).where(eq(webhooks.id, webhookId)).limit(1);
        const webhook = rows[0];
        if (!webhook) {
            console.warn(`[webhooks] deliverWebhook: webhook ${webhookId} not found`);
            return;
        }

        const deliveryId = randomUUID();
        const body = JSON.stringify(payload);
        const signature = "sha256=" + createHmac("sha256", webhook.secret).update(body).digest("hex");
        const now = new Date();

        let statusCode: string | null = null;
        let responseBody: string | null = null;
        let errorMessage: string | null = null;
        let deliveredAt: Date | null = null;

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

            let response: Response;
            try {
                response = await fetch(webhook.url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Cassette-Event": event,
                        "X-Cassette-Signature": signature,
                        "X-Cassette-Delivery": deliveryId,
                    },
                    body,
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timer);
            }

            statusCode = String(response.status);
            deliveredAt = new Date();

            const rawBody = await response.text().catch(() => "");
            responseBody = rawBody.length > RESPONSE_BODY_TAIL ? rawBody.slice(-RESPONSE_BODY_TAIL) : rawBody;
        } catch (fetchErr) {
            errorMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            console.warn(`[webhooks] delivery failed for ${webhookId} (${event}):`, errorMessage);
        }

        const deliveryStatus = statusCode
            ? parseInt(statusCode, 10) >= 200 && parseInt(statusCode, 10) < 300
                ? "success"
                : "error"
            : "error";

        // Record delivery attempt.
        await db.insert(webhookDeliveries).values({
            id: deliveryId,
            webhookId,
            event,
            payload,
            statusCode,
            responseBody,
            errorMessage,
            deliveredAt,
        });

        // Update last delivery fields on the webhook.
        await db
            .update(webhooks)
            .set({ lastDeliveryAt: now, lastDeliveryStatus: deliveryStatus, updatedAt: new Date() })
            .where(eq(webhooks.id, webhookId));
    } catch (err) {
        console.error("[webhooks] deliverWebhook unexpected error:", err);
    }
};
