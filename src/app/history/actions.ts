"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { watchHistory } from "@/server/db/schema/history";
import { and, eq } from "drizzle-orm";

export async function clearHistory(): Promise<{ ok: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    await db.delete(watchHistory).where(eq(watchHistory.userId, session.user.id));
    return { ok: true };
}

export async function removeHistoryItem(videoId: string): Promise<{ ok: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    await db
        .delete(watchHistory)
        .where(and(eq(watchHistory.userId, session.user.id), eq(watchHistory.videoId, videoId)));
    return { ok: true };
}
