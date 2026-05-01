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

// Removes a single watch_history row by primary key. The previous
// signature took videoId, which deleted *every* row for that video — a
// rewatch left no way to remove just one entry. Keying on the row id
// scopes the delete to the single click the user made.
export async function removeHistoryItem(historyId: string): Promise<{ ok: boolean; error?: string }> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: "Not authenticated." };

    await db
        .delete(watchHistory)
        .where(and(eq(watchHistory.userId, session.user.id), eq(watchHistory.id, historyId)));
    return { ok: true };
}
