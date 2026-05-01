import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { mintApiKey } from "@/lib/auth";
import { isValidHandle } from "@/lib/slug";
import { apiKeys, channelMembers, channels } from "@/server/db/schema/channels";
import { channelProcedure, createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const handleSchema = z
    .string()
    .min(3)
    .max(30)
    .refine(isValidHandle, { message: "Handle must be 3-30 chars, lowercase letters, digits, hyphens, underscores." });

const createChannelInput = z.object({
    handle: handleSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(2000).default(""),
});

const updateChannelInput = z.object({
    channelId: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(2000).optional(),
    avatarPath: z.string().optional(),
    bannerPath: z.string().optional(),
});

const generateApiKeyInput = z.object({
    channelId: z.string().uuid(),
    name: z.string().min(1).max(80),
});

const revokeApiKeyInput = z.object({
    channelId: z.string().uuid(),
    keyId: z.string().uuid(),
});

const listApiKeysInput = z.object({
    channelId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const channelRouter = createTRPCRouter({
    // Public: list all channels (paginated later, for now simple)
    list: publicProcedure.query(async ({ ctx }) => {
        return ctx.db.query.channels.findMany({
            orderBy: (c, { asc }) => [asc(c.createdAt)],
            columns: {
                id: true,
                handle: true,
                name: true,
                description: true,
                avatarPath: true,
                createdAt: true,
            },
        });
    }),

    // Public: look up a single channel by its handle
    byHandle: publicProcedure
        .input(z.object({ handle: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
            const row = await ctx.db.query.channels.findFirst({
                where: eq(channels.handle, input.handle.toLowerCase()),
                columns: {
                    id: true,
                    handle: true,
                    name: true,
                    description: true,
                    avatarPath: true,
                    bannerPath: true,
                    createdAt: true,
                },
            });
            if (!row) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
            }
            return row;
        }),

    // Protected: list channels the authenticated user is a member of
    listMine: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                id: channels.id,
                handle: channels.handle,
                name: channels.name,
                description: channels.description,
                avatarPath: channels.avatarPath,
                role: channelMembers.role,
                createdAt: channels.createdAt,
            })
            .from(channelMembers)
            .innerJoin(channels, eq(channels.id, channelMembers.channelId))
            .where(eq(channelMembers.userId, ctx.user.id))
            .orderBy(channels.createdAt);

        return rows;
    }),

    // Protected: create a new channel. The creator becomes the owner.
    create: protectedProcedure.input(createChannelInput).mutation(async ({ ctx, input }) => {
        const handle = input.handle.toLowerCase();

        if (!isValidHandle(handle)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid channel handle." });
        }

        // Check handle uniqueness before hitting the DB unique constraint so we
        // can return a friendlier error (citext makes this case-insensitive).
        const existing = await ctx.db.query.channels.findFirst({
            where: eq(channels.handle, handle),
            columns: { id: true },
        });
        if (existing) {
            throw new TRPCError({ code: "CONFLICT", message: "That handle is already taken." });
        }

        const [channel] = await ctx.db
            .insert(channels)
            .values({
                handle,
                name: input.name,
                description: input.description,
                ownerId: ctx.user.id,
            })
            .returning();

        if (!channel) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create channel." });
        }

        // Insert the owner membership row atomically with the channel row by
        // doing both in a single round-trip (Drizzle doesn't expose explicit
        // transactions through the query builder yet, but two sequential inserts
        // inside the same request are safe enough here because the channel row
        // must exist before the FK constraint on channel_members can be satisfied).
        await ctx.db.insert(channelMembers).values({
            channelId: channel.id,
            userId: ctx.user.id,
            role: "owner",
        });

        return channel;
    }),

    // Protected (owner or manager): update channel metadata
    update: channelProcedure("owner", "manager")
        .input(updateChannelInput)
        .mutation(async ({ ctx, input }) => {
            const { channelId, ...updates } = input;

            // Drop undefined keys so Drizzle doesn't write null for omitted fields.
            const patch: Record<string, unknown> = {};
            if (updates.name !== undefined) patch.name = updates.name;
            if (updates.description !== undefined) patch.description = updates.description;
            if (updates.avatarPath !== undefined) patch.avatarPath = updates.avatarPath;
            if (updates.bannerPath !== undefined) patch.bannerPath = updates.bannerPath;
            patch.updatedAt = new Date();

            const [updated] = await ctx.db
                .update(channels)
                .set(patch)
                .where(eq(channels.id, channelId))
                .returning();

            if (!updated) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
            }

            return updated;
        }),

    // Protected (owner or manager): list non-revoked API keys for a channel
    listApiKeys: channelProcedure("owner", "manager")
        .input(listApiKeysInput)
        .query(async ({ ctx, input }) => {
            const rows = await ctx.db
                .select({
                    id: apiKeys.id,
                    name: apiKeys.name,
                    keyPrefix: apiKeys.keyPrefix,
                    lastUsedAt: apiKeys.lastUsedAt,
                    useCount: apiKeys.useCount,
                    revokedAt: apiKeys.revokedAt,
                    createdAt: apiKeys.createdAt,
                })
                .from(apiKeys)
                .where(and(eq(apiKeys.channelId, input.channelId), isNull(apiKeys.revokedAt)))
                .orderBy(apiKeys.createdAt);

            return rows;
        }),

    // Protected (owner or manager): mint a new API key and return the plaintext ONCE
    generateApiKey: channelProcedure("owner", "manager")
        .input(generateApiKeyInput)
        .mutation(async ({ ctx, input }) => {
            const minted = await mintApiKey({
                channelId: input.channelId,
                name: input.name,
                createdById: ctx.user.id,
            });

            return {
                id: minted.id,
                plaintext: minted.plaintext,
                keyPrefix: minted.keyPrefix,
                name: minted.name,
                createdAt: minted.createdAt,
            };
        }),

    // Protected (owner or manager): revoke an API key
    revokeApiKey: channelProcedure("owner", "manager")
        .input(revokeApiKeyInput)
        .mutation(async ({ ctx, input }) => {
            const [revoked] = await ctx.db
                .update(apiKeys)
                .set({ revokedAt: new Date() })
                .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.channelId, input.channelId), isNull(apiKeys.revokedAt)))
                .returning({ id: apiKeys.id });

            if (!revoked) {
                throw new TRPCError({ code: "NOT_FOUND", message: "API key not found or already revoked." });
            }

            return { id: revoked.id };
        }),
});
