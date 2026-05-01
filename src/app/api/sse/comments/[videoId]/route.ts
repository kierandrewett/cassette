import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { gravatarHash } from "@/lib/gravatar";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema/auth";
import { channels } from "@/server/db/schema/channels";
import { comments } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// SSE: live new-comments feed for a video.
//
// Public route — anyone watching the video can subscribe. We poll the
// comments table every 5s and push any rows that appeared since the last
// tick. Per-video, per-IP we cap the open connections at 1: the watch page
// only mounts a single CommentTree, and a misbehaving client shouldn't be
// able to fan out a hundred listeners. Excess connections are 429'd.
//
// The payload mirrors the subset of fields CommentTree needs to prepend a
// row. Pending (moderation queue) comments are intentionally excluded.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
const KEEPALIVE_INTERVAL_MS = 25_000;
const MAX_CONNECTION_MS = 10 * 60_000;
const MAX_INITIAL_LOOKBACK = 25;

type SsePayload = {
    id: string;
    body: string;
    createdAt: string;
    parentId: string | null;
    rootId: string | null;
    author: {
        name: string | null;
        gravatarHash: string | null;
        channelHandle: string | null;
        image: string | null;
    };
};

// In-process registry of active connections per (videoId, ip). Module-level
// so it survives across requests in the same Node process. Multi-process
// deployments (e.g. PM2 cluster) get one slot per process — that's fine for
// the modest scale this platform targets.
const activeConnections = new Map<string, Set<string>>();

const slotKey = (videoId: string, ip: string): string => `${videoId}|${ip}`;

const tryAcquireSlot = (videoId: string, ip: string, connectionId: string): boolean => {
    const key = slotKey(videoId, ip);
    const set = activeConnections.get(key);
    if (set && set.size >= 1) return false;
    if (!set) {
        activeConnections.set(key, new Set([connectionId]));
    } else {
        set.add(connectionId);
    }
    return true;
};

const releaseSlot = (videoId: string, ip: string, connectionId: string): void => {
    const key = slotKey(videoId, ip);
    const set = activeConnections.get(key);
    if (!set) return;
    set.delete(connectionId);
    if (set.size === 0) activeConnections.delete(key);
};

const pickIp = (req: NextRequest): string => {
    // x-forwarded-for is set by every reasonable reverse proxy; fall back to
    // the request hostname so dev (no proxy) still gets a stable key.
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
    return "unknown";
};

const fetchSince = async (videoId: string, since: Date): Promise<SsePayload[]> => {
    const rows = await db
        .select({
            id: comments.id,
            body: comments.body,
            createdAt: comments.createdAt,
            parentId: comments.parentId,
            rootId: comments.rootId,
            authorId: comments.authorId,
            authorName: user.name,
            authorImage: user.image,
            authorEmail: user.email,
        })
        .from(comments)
        .leftJoin(user, eq(comments.authorId, user.id))
        .where(
            and(
                eq(comments.videoId, videoId),
                eq(comments.isPending, false),
                isNull(comments.deletedAt),
                gt(comments.createdAt, since),
            ),
        )
        .orderBy(desc(comments.createdAt))
        .limit(50);

    if (rows.length === 0) return [];

    // Resolve channel handles (one per author) for click-through to /c/<handle>.
    const authorIds = Array.from(new Set(rows.map((r) => r.authorId).filter((v): v is string => !!v)));
    const handleMap = new Map<string, string>();
    if (authorIds.length > 0) {
        const handles = await db
            .select({ ownerId: channels.ownerId, handle: channels.handle, createdAt: channels.createdAt })
            .from(channels)
            .where(inArray(channels.ownerId, authorIds))
            .orderBy(desc(channels.createdAt));
        for (const h of handles) {
            if (!handleMap.has(h.ownerId)) handleMap.set(h.ownerId, h.handle);
        }
    }

    return rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        parentId: r.parentId,
        rootId: r.rootId,
        author: {
            name: r.authorName,
            gravatarHash: r.authorEmail ? gravatarHash(r.authorEmail) : null,
            channelHandle: r.authorId ? (handleMap.get(r.authorId) ?? null) : null,
            image: r.authorImage,
        },
    }));
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ videoId: string }> }): Promise<Response> {
    const { videoId } = await ctx.params;

    if (!/^[0-9a-f-]{36}$/i.test(videoId)) {
        return new Response("Bad request", { status: 400 });
    }

    // Verify the video exists; we don't gate by privacy here because the
    // CommentTree is only rendered on watch pages whose access has already
    // been checked server-side. Mirroring that gate would require accepting
    // the unlisted slug too — out of scope for this iteration.
    const videoRows = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId)).limit(1);
    if (!videoRows[0]) {
        return new Response("Not found", { status: 404 });
    }

    const ip = pickIp(req);
    const connectionId = crypto.randomUUID();

    if (!tryAcquireSlot(videoId, ip, connectionId)) {
        // Soft fail with 429. The client can retry after the existing
        // connection terminates.
        return new Response("Too many connections", { status: 429 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false;
            // Track ids we've already shipped so a slow poll doesn't double-emit.
            const seenIds = new Set<string>();
            // The "since" cursor advances on every successful fetch. We seed
            // it to "now minus a tiny fudge" so any comments that landed
            // during the request handshake are still picked up.
            let since = new Date(Date.now() - 2_000);

            const cleanup = () => {
                clearInterval(pollTimer);
                clearInterval(keepaliveTimer);
                clearTimeout(hardCap);
                releaseSlot(videoId, ip, connectionId);
            };

            const close = () => {
                if (closed) return;
                closed = true;
                cleanup();
                try {
                    controller.close();
                } catch {
                    // already closed
                }
            };

            const send = (event: string, data: unknown) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                } catch {
                    closed = true;
                }
            };

            const sendComment = (comment: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`: ${comment}\n\n`));
                } catch {
                    closed = true;
                }
            };

            sendComment("connected");

            // Seed seenIds with the most recent comments so a spotty client
            // reconnect doesn't replay rows the user already has on screen.
            const initialRows = await db
                .select({ id: comments.id })
                .from(comments)
                .where(and(eq(comments.videoId, videoId), eq(comments.isPending, false), isNull(comments.deletedAt)))
                .orderBy(desc(comments.createdAt))
                .limit(MAX_INITIAL_LOOKBACK)
                .catch(() => []);
            for (const r of initialRows) seenIds.add(r.id);

            const tick = async () => {
                if (closed) return;
                try {
                    const newRows = await fetchSince(videoId, since);
                    if (newRows.length === 0) return;
                    // Ascending order so the client can prepend in the order
                    // they were created.
                    const ascending = newRows.slice().reverse();
                    for (const row of ascending) {
                        if (seenIds.has(row.id)) continue;
                        seenIds.add(row.id);
                        send("comment", row);
                        // Bound seenIds so a long-lived stream doesn't grow forever.
                        if (seenIds.size > 500) {
                            const trimmed = Array.from(seenIds).slice(-300);
                            seenIds.clear();
                            for (const id of trimmed) seenIds.add(id);
                        }
                        const ts = new Date(row.createdAt);
                        if (ts > since) since = ts;
                    }
                } catch {
                    // Swallow — next tick will retry.
                }
            };

            const pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
            const keepaliveTimer = setInterval(() => sendComment("keepalive"), KEEPALIVE_INTERVAL_MS);
            const hardCap = setTimeout(close, MAX_CONNECTION_MS);

            req.signal.addEventListener("abort", close);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
