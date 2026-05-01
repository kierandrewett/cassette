"use client";

import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_PUBLIC_URL ?? ""),
    plugins: [
        passkeyClient(),
        // No twoFactorPage — we handle the challenge inline in AuthLoginForm.
        twoFactorClient(),
    ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
