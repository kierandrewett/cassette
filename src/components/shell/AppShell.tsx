import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema";
import { adminGrants } from "@/server/db/schema/admin";
import { eq } from "drizzle-orm";
import { AppHeader, type AppHeaderUser } from "./AppHeader";
import { LeftRail, type UserChannel } from "./LeftRail";
import { MobileNav } from "./MobileNav";

interface AppShellProps {
    children: React.ReactNode;
}

// Server component: fetches session + user channels, then renders the
// header, left rail, and passes children into the main content area.
// The left rail CSS variable offsets are defined in globals.css:
//   --rail-width: 220px
//   --rail-collapsed-width: 60px
const AppShell = async ({ children }: AppShellProps) => {
    const session = await auth.api.getSession({ headers: await headers() });

    let user: AppHeaderUser | null = null;
    let userChannels: UserChannel[] = [];
    let isAdmin = false;

    if (session?.user) {
        user = {
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
        };

        // Fetch channels owned by this user for the left rail "You" section.
        const [channelRows, adminRows] = await Promise.all([
            db
                .select({
                    id: channels.id,
                    handle: channels.handle,
                    name: channels.name,
                    avatarPath: channels.avatarPath,
                })
                .from(channels)
                .where(eq(channels.ownerId, session.user.id)),
            db
                .select({ userId: adminGrants.userId })
                .from(adminGrants)
                .where(eq(adminGrants.userId, session.user.id))
                .limit(1),
        ]);
        userChannels = channelRows;
        isAdmin = !!adminRows[0];
    }

    return (
        <div className="min-h-full">
            <AppHeader user={user} isAdmin={isAdmin} />

            {/* Left rail: hidden below md, expanded by default above */}
            <div className="hidden md:block">
                <LeftRail channels={userChannels} />
            </div>

            {/* Main content: offset by rail width on md+, full-width on mobile */}
            <main
                className="pt-14 md:pl-[var(--rail-width)] transition-[padding] duration-200"
                id="main-content"
            >
                {children}
            </main>

            {/* Mobile bottom tab bar — only visible below md */}
            <MobileNav />
        </div>
    );
};

export default AppShell;
