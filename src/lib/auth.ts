import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import { sendMail } from "@/lib/mail";
import { db } from "@/server/db/client";
import { account, passkey as passkeyTable, session, twoFactor as twoFactorTable, user, verification } from "@/server/db/schema/auth";
import { apiKeys, channels, type Channel } from "@/server/db/schema/channels";

// Better-Auth server instance. Uses the Drizzle adapter against the auth
// tables in @/server/db/schema/auth.ts.
//
// API keys are NOT managed by Better-Auth: the 1.6 line does not ship an
// api-key plugin, and we want full control over channel scoping anyway.
// Plaintext keys look like `vid_<22-char-nanoid>`; see
// `mintApiKey()` and `verifyApiKey()` below.

// Derive the hostname (rpID) from PUBLIC_URL, e.g. "cassette.example.com".
const rpID = new URL(env.PUBLIC_URL).hostname;

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user,
            session,
            account,
            verification,
            passkey: passkeyTable,
            twoFactor: twoFactorTable,
        },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? env.PUBLIC_URL,
    plugins: [
        passkey({
            rpName: "cassette",
            rpID,
        }),
        twoFactor({
            skipVerificationOnEnable: false,
        }),
    ],
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        autoSignIn: true,
        sendResetPassword: async ({ user: recipient, url }: { user: { email: string; name: string }; url: string }) => {
            await sendMail({
                to: recipient.email,
                subject: "Reset your cassette password",
                text: `Hi ${recipient.name},\n\nClick the link below to reset your cassette password.\nThis link expires in 1 hour.\n\n${url}\n\nIf you did not request a password reset you can safely ignore this email.`,
                html: `<p>Hi ${recipient.name},</p><p>Click the link below to reset your cassette password. This link expires in 1&nbsp;hour.</p><p><a href="${url}">${url}</a></p><p>If you did not request a password reset you can safely ignore this email.</p>`,
            });
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 30,
        updateAge: 60 * 60 * 24,
    },
});

export type Auth = typeof auth;
export type AuthSession = Awaited<ReturnType<Auth["api"]["getSession"]>>;

const KEY_PREFIX = "vid_";
const KEY_RANDOM_LEN = 22;

const sha256Hex = (input: string): string => createHash("sha256").update(input).digest("hex");

const randomKeyBody = (): string => {
    // 22-char URL-safe random string. We use base64url so the alphabet matches
    // typical SDK expectations and the prefix-based lookup index stays sortable.
    const bytes = randomBytes(18);
    return bytes
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
        .slice(0, KEY_RANDOM_LEN);
};

export type MintedApiKey = {
    id: string;
    channelId: string;
    name: string;
    plaintext: string;
    keyPrefix: string;
    createdAt: Date;
};

// Create a new API key for a channel. Returns the plaintext exactly once; the
// caller is responsible for showing it to the user and not persisting it.
export const mintApiKey = async (params: {
    channelId: string;
    name: string;
    createdById: string;
}): Promise<MintedApiKey> => {
    const body = randomKeyBody();
    const plaintext = `${KEY_PREFIX}${body}`;
    const keyPrefix = plaintext.slice(0, 12);
    const keyHash = sha256Hex(plaintext);

    const [row] = await db
        .insert(apiKeys)
        .values({
            channelId: params.channelId,
            createdById: params.createdById,
            name: params.name,
            keyPrefix,
            keyHash,
        })
        .returning();

    if (!row) {
        throw new Error("failed to mint api key");
    }

    return {
        id: row.id,
        channelId: row.channelId,
        name: row.name,
        plaintext,
        keyPrefix,
        createdAt: row.createdAt,
    };
};

export type VerifiedApiKey = {
    apiKeyId: string;
    channel: Channel;
};

// Validate a plaintext bearer token. Returns the channel + key id on success,
// null otherwise. Updates last-used / use-count fire-and-forget.
export const verifyApiKey = async (plaintext: string): Promise<VerifiedApiKey | null> => {
    if (!plaintext.startsWith(KEY_PREFIX)) return null;
    const keyPrefix = plaintext.slice(0, 12);
    const keyHash = sha256Hex(plaintext);

    const rows = await db
        .select({
            apiKey: apiKeys,
            channel: channels,
        })
        .from(apiKeys)
        .innerJoin(channels, eq(channels.id, apiKeys.channelId))
        .where(and(eq(apiKeys.keyPrefix, keyPrefix), isNull(apiKeys.revokedAt)))
        .limit(1);

    const row = rows[0];
    if (!row) return null;

    // Constant-time compare on the hex strings to deny timing oracles.
    const a = Buffer.from(row.apiKey.keyHash);
    const b = Buffer.from(keyHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return null;
    }

    void db
        .update(apiKeys)
        .set({ lastUsedAt: new Date(), useCount: row.apiKey.useCount + 1 })
        .where(eq(apiKeys.id, row.apiKey.id))
        .catch(() => undefined);

    return {
        apiKeyId: row.apiKey.id,
        channel: row.channel,
    };
};
