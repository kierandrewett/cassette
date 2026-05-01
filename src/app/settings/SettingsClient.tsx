"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// Small client component for the sign-out button so the settings page can
// remain a server component for everything else.
export const SignOutButton = () => {
    const router = useRouter();

    const handleSignOut = async () => {
        await authClient.signOut();
        router.push("/");
    };

    return (
        <button
            onClick={handleSignOut}
            className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            Sign out
        </button>
    );
};
