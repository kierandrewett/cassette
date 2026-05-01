import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { adminGrants } from "@/server/db/schema/admin";

/**
 * Server-side admin guard for RSC pages.
 *
 * Loads the session from the incoming request headers, verifies the user has a
 * row in `admin_grants`, and returns the session user. Redirects to `/` if the
 * caller is unauthenticated or not an admin.
 */
export const requireAdmin = async (headers: Headers) => {
    const session = await auth.api.getSession({ headers }).catch(() => null);
    if (!session?.user) {
        redirect("/");
    }

    const rows = await db
        .select({ userId: adminGrants.userId })
        .from(adminGrants)
        .where(eq(adminGrants.userId, session.user.id))
        .limit(1);

    if (!rows[0]) {
        redirect("/");
    }

    return session.user;
};
