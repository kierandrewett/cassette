// Fires a sign-in alert email when a new device/IP combination is detected
// for a user who has opted in to sign-in alerts.

import { and, desc, eq, gte } from "drizzle-orm";

import { env } from "@/env";
import { sendMail } from "@/lib/mail";
import { db } from "@/server/db/client";
import { session as sessionTable, user as userTable } from "@/server/db/schema/auth";
import { userPreferences } from "@/server/db/schema/preferences";

interface SessionLike {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt?: Date;
}

/**
 * Called after Better-Auth creates a new session. Checks whether the user has
 * sign-in alerts enabled and, if so, whether this (ipAddress, userAgent) pair
 * has been seen in the last 30 days. If not seen before, sends an alert email.
 */
export const maybeFireSignInAlert = async (session: SessionLike): Promise<void> => {
    try {
        const { userId, ipAddress, userAgent } = session;

        // Load preferences; skip quickly if no row or alerts disabled.
        const prefRows = await db
            .select({ signInAlerts: userPreferences.signInAlerts })
            .from(userPreferences)
            .where(eq(userPreferences.userId, userId))
            .limit(1);

        const prefs = prefRows[0];
        if (!prefs?.signInAlerts) return;

        // Load the user for their email and name.
        const userRows = await db
            .select({ email: userTable.email, name: userTable.name })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        const user = userRows[0];
        if (!user) return;

        // Look for the same (ipAddress, userAgent) pair in the last 30 days.
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const recentSessions = await db
            .select({
                ipAddress: sessionTable.ipAddress,
                userAgent: sessionTable.userAgent,
            })
            .from(sessionTable)
            .where(and(eq(sessionTable.userId, userId), gte(sessionTable.createdAt, thirtyDaysAgo)))
            .orderBy(desc(sessionTable.createdAt))
            .limit(100);

        // Check whether this exact (ip, ua) combination appeared before.
        const alreadySeen = recentSessions.some(
            (s) => s.ipAddress === (ipAddress ?? null) && s.userAgent === (userAgent ?? null),
        );

        if (alreadySeen) return;

        const baseUrl = env.PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
        const forgotPasswordUrl = `${baseUrl}/forgot-password`;
        const when = (session.createdAt ?? new Date()).toUTCString();
        const device = userAgent ?? "Unknown device";
        const ip = ipAddress ?? "Unknown IP";

        const text =
            `Hi ${user.name},\n\n` +
            `A new sign-in to your cassette account was detected.\n\n` +
            `When: ${when}\n` +
            `IP address: ${ip}\n` +
            `Device: ${device}\n\n` +
            `If this was you, no action is needed.\n\n` +
            `If this wasn't you, please change your password immediately:\n${forgotPasswordUrl}\n`;

        const html =
            `<p>Hi ${user.name},</p>` +
            `<p>A new sign-in to your cassette account was detected.</p>` +
            `<table style="border-collapse:collapse;margin-bottom:1em">` +
            `<tr><td style="padding:4px 12px 4px 0;color:#888">When</td><td>${when}</td></tr>` +
            `<tr><td style="padding:4px 12px 4px 0;color:#888">IP address</td><td>${ip}</td></tr>` +
            `<tr><td style="padding:4px 12px 4px 0;color:#888">Device</td><td>${device}</td></tr>` +
            `</table>` +
            `<p>If this was you, no action is needed.</p>` +
            `<p>If this wasn't you, please <a href="${forgotPasswordUrl}">change your password immediately</a>.</p>`;

        await sendMail({
            to: user.email,
            subject: "New sign-in to your cassette account",
            text,
            html,
        });
    } catch (err) {
        // Best-effort — never let a sign-in alert failure block auth.
        console.warn("[sign-in-alert] failed to fire alert:", err);
    }
};
