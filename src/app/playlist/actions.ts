"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { and, eq, max } from "drizzle-orm";

import { unlistedSlug } from "@/lib/slug";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { playlistItems, playlists } from "@/server/db/schema/playlists";

export type PlaylistPrivacy = "public" | "unlisted" | "private";

export async function createPlaylist(input: {
    title: string;
    description: string;
    privacy: PlaylistPrivacy;
}): Promise<{ id: string; title: string } | { error: string }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { error: "Not authenticated." };

    const slug = input.privacy === "unlisted" ? unlistedSlug() : null;

    const [playlist] = await db
        .insert(playlists)
        .values({
            ownerId: session.user.id,
            kind: "user",
            title: input.title.trim(),
            description: input.description,
            privacy: input.privacy,
            unlistedSlug: slug,
        })
        .returning({ id: playlists.id, title: playlists.title });

    if (!playlist) return { error: "Failed to create playlist." };

    revalidatePath("/library");
    return playlist;
}

export async function removePlaylistItem(itemId: string): Promise<{ ok: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    // Verify ownership via join.
    const item = await db
        .select({ id: playlistItems.id, playlistId: playlistItems.playlistId })
        .from(playlistItems)
        .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
        .where(and(eq(playlistItems.id, itemId), eq(playlists.ownerId, session.user.id)))
        .limit(1)
        .then((r) => r[0]);

    if (!item) return { ok: false, error: "Item not found or you do not own this playlist." };

    await db.delete(playlistItems).where(eq(playlistItems.id, itemId));
    return { ok: true };
}

export async function reorderPlaylistItems(
    playlistId: string,
    itemIds: string[],
): Promise<{ ok: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    const playlist = await db
        .select({ id: playlists.id, ownerId: playlists.ownerId })
        .from(playlists)
        .where(eq(playlists.id, playlistId))
        .limit(1)
        .then((r) => r[0]);

    if (!playlist || playlist.ownerId !== session.user.id) {
        return { ok: false, error: "Not authorised." };
    }

    await db.transaction(async (tx) => {
        // Pass 1: set negative sentinel positions to vacate the positive slots.
        for (let i = 0; i < itemIds.length; i++) {
            await tx
                .update(playlistItems)
                .set({ position: -(i + 1) })
                .where(and(eq(playlistItems.id, itemIds[i]!), eq(playlistItems.playlistId, playlistId)));
        }
        // Pass 2: set final positive positions.
        for (let i = 0; i < itemIds.length; i++) {
            await tx
                .update(playlistItems)
                .set({ position: i })
                .where(and(eq(playlistItems.id, itemIds[i]!), eq(playlistItems.playlistId, playlistId)));
        }
    });

    return { ok: true };
}

export async function addToWatchLater(videoId: string): Promise<{ ok: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    // Find or create the watch_later system playlist.
    let watchLaterPlaylist = await db
        .select({ id: playlists.id })
        .from(playlists)
        .where(and(eq(playlists.ownerId, session.user.id), eq(playlists.kind, "watch_later")))
        .limit(1)
        .then((r) => r[0]);

    if (!watchLaterPlaylist) {
        const [created] = await db
            .insert(playlists)
            .values({ ownerId: session.user.id, kind: "watch_later", title: "Watch Later", privacy: "private" })
            .onConflictDoNothing()
            .returning({ id: playlists.id });

        if (!created) {
            watchLaterPlaylist = await db
                .select({ id: playlists.id })
                .from(playlists)
                .where(and(eq(playlists.ownerId, session.user.id), eq(playlists.kind, "watch_later")))
                .limit(1)
                .then((r) => r[0]);
        } else {
            watchLaterPlaylist = created;
        }
    }

    if (!watchLaterPlaylist) return { ok: false, error: "Failed to find Watch Later playlist." };

    const [result] = await db
        .select({ maxPos: max(playlistItems.position) })
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, watchLaterPlaylist.id));
    const nextPos = (result?.maxPos ?? -1) + 1;

    await db
        .insert(playlistItems)
        .values({ playlistId: watchLaterPlaylist.id, videoId, position: nextPos })
        .onConflictDoNothing();

    return { ok: true };
}
