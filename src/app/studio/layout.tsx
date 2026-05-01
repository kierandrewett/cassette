import type { ReactNode } from "react";

import AppShell from "@/components/shell/AppShell";

// Studio root layout.
//
// Every page under /studio renders inside the main AppShell so the top bar
// (logo, search, avatar) and left rail are present, matching /home and /library.
// The channel-scoped subnav lives in a nested layout at
// /studio/channel/[handle]/layout.tsx so it can resolve the active channel from
// params; the top-level /studio page renders its own root-mode subnav
// directly because it doesn't have a single "active" channel.
const StudioLayout = ({ children }: { children: ReactNode }) => {
    return (
        <AppShell>
            <div className="px-4 pb-12 md:px-6 lg:px-8">{children}</div>
        </AppShell>
    );
};

export default StudioLayout;
