// tRPC router for account-level operations: session listing and revocation,
// sign-in alert preferences, GDPR data export, and account deletion.

import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { cleanupVideoFiles } from "@/lib/cleanup";
import { session as sessionTable, user as userTable } from "@/server/db/schema/auth";
import { channels, channelMembers } from "@/server/db/schema/channels";
import { watchHistory, watchProgress } from "@/server/db/schema/history";
import { playlists } from "@/server/db/schema/playlists";
import { userPreferences } from "@/server/db/schema/preferences";
import { subscriptions, videoLikes, comments } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const accountRouter = createTRPCRouter({
    // Return all active sessions for the caller, ordered newest-first.
    // Includes a `currentSession` flag for the session making this request.
    listSessions: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(sessionTable)
            .where(eq(sessionTable.userId, ctx.user.id))
            .orderBy(desc(sessionTable.createdAt));

        const currentSessionId = ctx.session.session.id;
        return rows.map((row) => ({
            id: row.id,
            createdAt: row.createdAt,
            expiresAt: row.expiresAt,
            ipAddress: row.ipAddress,
            userAgent: row.userAgent,
            currentSession: row.id === currentSessionId,
        }));
    }),

    // Revoke a specific session. Refuses to revoke the caller's current session.
    revokeSession: protectedProcedure
        .input(z.object({ sessionId: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            if (input.sessionId === ctx.session.session.id) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Cannot revoke your current session. Sign out instead.",
                });
            }

            const deleted = await ctx.db
                .delete(sessionTable)
                .where(and(eq(sessionTable.id, input.sessionId), eq(sessionTable.userId, ctx.user.id)))
                .returning({ id: sessionTable.id });

            if (!deleted[0]) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
            }

            return { revoked: true };
        }),

    // Revoke every session for the caller except the current one.
    revokeAllOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
        await ctx.db
            .delete(sessionTable)
            .where(and(eq(sessionTable.userId, ctx.user.id), ne(sessionTable.id, ctx.session.session.id)));

        return { revoked: true };
    }),

    // --------------------------------------------------------------------------
    // Sign-in alerts
    // --------------------------------------------------------------------------

    // Get the current sign-in alerts preference.
    getSignInAlerts: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({ signInAlerts: userPreferences.signInAlerts })
            .from(userPreferences)
            .where(eq(userPreferences.userId, ctx.user.id))
            .limit(1);

        return { enabled: rows[0]?.signInAlerts ?? false };
    }),

    // Enable or disable sign-in alert emails.
    setSignInAlerts: protectedProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
        await ctx.db
            .insert(userPreferences)
            .values({
                userId: ctx.user.id,
                signInAlerts: input.enabled,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [userPreferences.userId],
                set: { signInAlerts: input.enabled, updatedAt: new Date() },
            });

        return { enabled: input.enabled };
    }),

    // --------------------------------------------------------------------------
    // GDPR data export
    // --------------------------------------------------------------------------

    // Compile and return all the caller's data as a JSON document.
    // IPs are truncated to /24 for privacy. For v1 the payload is returned
    // inline; a future version could email a download link instead.
    requestDataExport: protectedProcedure.mutation(async ({ ctx }) => {
        const userId = ctx.user.id;

        const [
            userRows,
            sessionRows,
            channelRows,
            memberChannelRows,
            videoRows,
            commentRows,
            likeRows,
            subscriptionRows,
            historyRows,
            progressRows,
            playlistRows,
        ] = await Promise.all([
            // Profile
            ctx.db
                .select({
                    id: userTable.id,
                    name: userTable.name,
                    email: userTable.email,
                    createdAt: userTable.createdAt,
                })
                .from(userTable)
                .where(eq(userTable.id, userId))
                .limit(1),

            // Sessions (redact IPs to /24)
            ctx.db
                .select({
                    id: sessionTable.id,
                    createdAt: sessionTable.createdAt,
                    expiresAt: sessionTable.expiresAt,
                    ipAddress: sessionTable.ipAddress,
                    userAgent: sessionTable.userAgent,
                })
                .from(sessionTable)
                .where(eq(sessionTable.userId, userId))
                .orderBy(desc(sessionTable.createdAt)),

            // Channels owned
            ctx.db
                .select({
                    id: channels.id,
                    handle: channels.handle,
                    name: channels.name,
                    description: channels.description,
                    createdAt: channels.createdAt,
                })
                .from(channels)
                .where(eq(channels.ownerId, userId)),

            // Channels the user is a member of (not owner)
            ctx.db
                .select({
                    channelId: channelMembers.channelId,
                    role: channelMembers.role,
                    createdAt: channelMembers.createdAt,
                })
                .from(channelMembers)
                .where(eq(channelMembers.userId, userId)),

            // Videos uploaded
            ctx.db
                .select({
                    id: videos.id,
                    channelId: videos.channelId,
                    title: videos.title,
                    description: videos.description,
                    privacy: videos.privacy,
                    status: videos.status,
                    durationSec: videos.durationSec,
                    viewCount: videos.viewCount,
                    publishedAt: videos.publishedAt,
                    createdAt: videos.createdAt,
                })
                .from(videos)
                .where(eq(videos.uploaderId, userId)),

            // Comments
            ctx.db
                .select({
                    id: comments.id,
                    videoId: comments.videoId,
                    body: comments.body,
                    createdAt: comments.createdAt,
                })
                .from(comments)
                .where(eq(comments.authorId, userId))
                .orderBy(desc(comments.createdAt)),

            // Likes / reactions
            ctx.db
                .select({
                    videoId: videoLikes.videoId,
                    kind: videoLikes.kind,
                    createdAt: videoLikes.createdAt,
                })
                .from(videoLikes)
                .where(eq(videoLikes.userId, userId))
                .orderBy(desc(videoLikes.createdAt)),

            // Subscriptions
            ctx.db
                .select({
                    channelId: subscriptions.channelId,
                    notify: subscriptions.notify,
                    createdAt: subscriptions.createdAt,
                })
                .from(subscriptions)
                .where(eq(subscriptions.userId, userId))
                .orderBy(desc(subscriptions.createdAt)),

            // Watch history
            ctx.db
                .select({
                    videoId: watchHistory.videoId,
                    watchedAt: watchHistory.watchedAt,
                })
                .from(watchHistory)
                .where(eq(watchHistory.userId, userId))
                .orderBy(desc(watchHistory.watchedAt))
                .limit(5000),

            // Watch progress
            ctx.db
                .select({
                    videoId: watchProgress.videoId,
                    positionSec: watchProgress.positionSec,
                    durationSec: watchProgress.durationSec,
                    completed: watchProgress.completed,
                    updatedAt: watchProgress.updatedAt,
                })
                .from(watchProgress)
                .where(eq(watchProgress.userId, userId)),

            // Playlists (user-created only)
            ctx.db
                .select({
                    id: playlists.id,
                    title: playlists.title,
                    description: playlists.description,
                    kind: playlists.kind,
                    privacy: playlists.privacy,
                    createdAt: playlists.createdAt,
                })
                .from(playlists)
                .where(eq(playlists.ownerId, userId))
                .orderBy(desc(playlists.createdAt)),
        ]);

        // Redact IP addresses to /24 (IPv4) — strip the last octet.
        const redactIp = (ip: string | null): string | null => {
            if (!ip) return null;
            const parts = ip.split(".");
            if (parts.length === 4) {
                return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
            }
            // IPv6 — redact the last 64 bits (last 4 groups).
            const v6parts = ip.split(":");
            if (v6parts.length >= 5) {
                return v6parts.slice(0, 4).join(":") + "::/64";
            }
            return null;
        };

        const exportDoc = {
            exportedAt: new Date().toISOString(),
            profile: userRows[0] ?? null,
            sessions: sessionRows.map((s) => ({
                ...s,
                ipAddress: redactIp(s.ipAddress),
            })),
            channelsOwned: channelRows,
            channelMemberships: memberChannelRows,
            videosUploaded: videoRows,
            comments: commentRows,
            likes: likeRows,
            subscriptions: subscriptionRows,
            watchHistory: historyRows,
            watchProgress: progressRows,
            playlists: playlistRows,
        };

        return exportDoc;
    }),

    // --------------------------------------------------------------------------
    // Account deletion
    // --------------------------------------------------------------------------

    // Delete the caller's account after confirming their email address.
    // FK cascades handle sessions, accounts, subscriptions, comments, likes,
    // watch history, watch progress, playlists. Channels owned are deleted
    // explicitly first so their videos' on-disk files can be cleaned up.
    deleteAccount: protectedProcedure
        .input(z.object({ confirmEmail: z.string().email() }))
        .mutation(async ({ ctx, input }) => {
            const user = ctx.user;

            if (input.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "The email address you entered does not match your account.",
                });
            }

            // Find channels this user owns so we can clean up their videos on disk.
            const ownedChannels = await ctx.db
                .select({ id: channels.id, handle: channels.handle })
                .from(channels)
                .where(eq(channels.ownerId, user.id));

            for (const channel of ownedChannels) {
                // Load all videos for this channel.
                const channelVideos = await ctx.db
                    .select({ id: videos.id, sourcePath: videos.sourcePath })
                    .from(videos)
                    .where(eq(videos.channelId, channel.id));

                // Clean up on-disk files for each video (best-effort).
                for (const video of channelVideos) {
                    await cleanupVideoFiles({
                        videoId: video.id,
                        sourcePath: video.sourcePath,
                        channelHandle: channel.handle,
                    });
                }

                // Delete the channel (cascades to videos, members, apiKeys).
                await ctx.db.delete(channels).where(eq(channels.id, channel.id));
            }

            // Record audit log before deleting (actor = the user being deleted).
            recordAudit({
                actorId: user.id,
                action: "user.delete",
                targetType: "user",
                targetId: user.id,
                details: { selfDelete: true },
                headers: ctx.headers,
            });

            // Delete the user — FK cascades wipe sessions, accounts, subscriptions,
            // comments (set null), likes, history, watchProgress, playlists.
            await ctx.db.delete(userTable).where(eq(userTable.id, user.id));

            return { deleted: true };
        }),
});
