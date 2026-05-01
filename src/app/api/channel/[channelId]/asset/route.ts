import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";

import busboy from "busboy";
import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";

import { auth, verifyApiKey } from "@/lib/auth";
import { channelAssetPath, channelAssetRelative, channelAssetsDir, ensureDir } from "@/lib/paths";
import { db } from "@/server/db/client";
import { channelMembers, channels } from "@/server/db/schema/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BANNER_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

type AssetKind = "avatar" | "banner";

const ALLOWED_EXTS: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};

// ---------------------------------------------------------------------------
// Magic-byte validation
// ---------------------------------------------------------------------------

// Returns the canonical extension for the file if the magic bytes match a
// supported image format, or null if the content is unrecognised.
const detectImageExt = (buf: Buffer): string | null => {
    if (buf.length < 12) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
    )
        return ".png";
    // WebP: "RIFF????WEBP" — bytes 0-3 = 52 49 46 46, bytes 8-11 = 57 45 42 50
    if (
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
    )
        return ".webp";
    return null;
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

// Resolves the channelId the caller is permitted to manage.
// Returns null with a Response already set if auth fails.
type AuthResult = { ok: true; resolvedChannelId: string } | { ok: false; response: Response };

const resolveAuth = async (req: NextRequest, channelIdFromPath: string): Promise<AuthResult> => {
    const authHeader = req.headers.get("authorization") ?? "";

    if (authHeader.startsWith("Bearer vid_")) {
        const plaintext = authHeader.slice("Bearer ".length);
        const verified = await verifyApiKey(plaintext);
        if (!verified) {
            return { ok: false, response: json(401, { error: "invalid or revoked API key" }) };
        }
        if (verified.channel.id !== channelIdFromPath) {
            return { ok: false, response: json(403, { error: "API key does not belong to this channel" }) };
        }
        return { ok: true, resolvedChannelId: channelIdFromPath };
    }

    // Session auth
    const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
    if (!session?.user) {
        return { ok: false, response: json(401, { error: "not authenticated" }) };
    }

    const memberRows = await db
        .select({ role: channelMembers.role })
        .from(channelMembers)
        .where(and(eq(channelMembers.channelId, channelIdFromPath), eq(channelMembers.userId, session.user.id)))
        .limit(1);

    const member = memberRows[0];
    if (!member) {
        return { ok: false, response: json(403, { error: "not a member of this channel" }) };
    }
    if (member.role !== "owner" && member.role !== "manager") {
        return { ok: false, response: json(403, { error: "owner or manager role required" }) };
    }

    return { ok: true, resolvedChannelId: channelIdFromPath };
};

// ---------------------------------------------------------------------------
// POST — upload avatar or banner
// ---------------------------------------------------------------------------

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ channelId: string }> },
): Promise<Response> {
    const { channelId } = await params;

    const authResult = await resolveAuth(req, channelId);
    if (!authResult.ok) return authResult.response;

    // Verify channel exists.
    const channelRows = await db.select({ id: channels.id }).from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channelRows[0]) return json(404, { error: "channel not found" });

    // Parse multipart form — collect file into memory (≤10 MB, safe for images).
    const rawBody = req.body;
    if (!rawBody) return json(400, { error: "empty body" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(rawBody as any);

    const incomingHeaders = Object.fromEntries(req.headers.entries());

    type ParseResult = { kind: AssetKind; data: Buffer; mimeType: string };

    const parseResult = await new Promise<ParseResult | { error: string; status: number }>((resolve) => {
        const bb = busboy({
            headers: incomingHeaders as Record<string, string>,
            limits: { fieldSize: 64, fileSize: BANNER_MAX_BYTES, files: 1 },
        });

        let kind: AssetKind | null = null;
        const chunks: Buffer[] = [];
        let mimeType = "";
        let oversize = false;
        let fileReceived = false;

        bb.on("field", (name, val) => {
            if (name === "kind") {
                if (val === "avatar" || val === "banner") kind = val;
            }
        });

        bb.on("file", (_name, stream, info) => {
            fileReceived = true;
            mimeType = info.mimeType;
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("limit", () => {
                oversize = true;
            });
            stream.resume(); // drain even if we reject below
        });

        bb.on("finish", () => {
            if (!kind) {
                resolve({ error: 'kind field must be "avatar" or "banner"', status: 400 });
                return;
            }
            if (!fileReceived) {
                resolve({ error: "file field is required", status: 400 });
                return;
            }
            if (oversize) {
                const maxMB = kind === "avatar" ? 5 : 10;
                resolve({ error: `file exceeds maximum size (${maxMB} MB)`, status: 413 });
                return;
            }
            const data = Buffer.concat(chunks);
            // Re-check size against the tighter avatar limit after we know the kind.
            if (kind === "avatar" && data.length > AVATAR_MAX_BYTES) {
                resolve({ error: "file exceeds maximum size (5 MB) for avatar", status: 413 });
                return;
            }
            resolve({ kind, data, mimeType });
        });

        bb.on("error", (err) => resolve({ error: (err as Error).message, status: 400 }));

        nodeStream.pipe(bb);
    });

    if ("error" in parseResult) return json(parseResult.status, { error: parseResult.error });

    const { kind, data, mimeType: rawMime } = parseResult;

    // Validate magic bytes. Prefer detection over MIME since MIME can be spoofed.
    const detectedExt = detectImageExt(data);
    if (!detectedExt) {
        return json(415, { error: "unsupported image format; only JPEG, PNG, and WebP are accepted" });
    }

    // Cross-check against declared MIME if the client bothered to declare one.
    const declaredExt = ALLOWED_EXTS[rawMime];
    if (declaredExt && declaredExt !== detectedExt) {
        return json(415, { error: "declared MIME type does not match file content" });
    }

    // Write to _assets/<channelId>/<kind>.<ext>
    await ensureDir(channelAssetsDir(channelId));
    const destPath = channelAssetPath(channelId, kind, detectedExt);

    // Write atomically: write to temp, then rename.
    const tmpPath = `${destPath}.tmp`;
    const writable = createWriteStream(tmpPath);
    await new Promise<void>((res, rej) => {
        writable.write(data, (err) => (err ? rej(err) : res()));
    });
    writable.end();
    await new Promise<void>((res, rej) => writable.on("finish", res).on("error", rej));

    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, destPath);

    // Remove stale files for other extensions (e.g. old avatar.jpg when uploading avatar.png).
    for (const ext of [".jpg", ".png", ".webp"]) {
        if (ext === detectedExt) continue;
        const stale = channelAssetPath(channelId, kind, ext);
        await unlink(stale).catch(() => undefined);
    }

    // Persist relative path to DB.
    const relativePath = channelAssetRelative(channelId, kind, detectedExt);
    const patch =
        kind === "avatar"
            ? { avatarPath: relativePath, updatedAt: new Date() }
            : { bannerPath: relativePath, updatedAt: new Date() };

    await db.update(channels).set(patch).where(eq(channels.id, channelId));

    const url = `/api/channel/${channelId}/asset/${kind}`;
    return json(200, { url });
}

// ---------------------------------------------------------------------------
// DELETE — remove avatar or banner
// ---------------------------------------------------------------------------

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ channelId: string }> },
): Promise<Response> {
    const { channelId } = await params;

    const authResult = await resolveAuth(req, channelId);
    if (!authResult.ok) return authResult.response;

    const kind = req.nextUrl.searchParams.get("kind");
    if (kind !== "avatar" && kind !== "banner") {
        return json(400, { error: 'query param kind must be "avatar" or "banner"' });
    }

    // Remove all extension variants best-effort.
    for (const ext of [".jpg", ".png", ".webp"]) {
        const p = channelAssetPath(channelId, kind, ext);
        await unlink(p).catch(() => undefined);
    }

    const patch =
        kind === "avatar" ? { avatarPath: null, updatedAt: new Date() } : { bannerPath: null, updatedAt: new Date() };

    await db.update(channels).set(patch).where(eq(channels.id, channelId));

    return json(200, { ok: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
