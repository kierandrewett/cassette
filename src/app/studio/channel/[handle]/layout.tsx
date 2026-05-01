import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { StudioSubNav, type StudioChannel } from "@/components/studio/StudioSubNav";
import { trpc } from "@/lib/trpc/server";

interface Props {
    children: ReactNode;
    params: Promise<{ handle: string }>;
}

// Channel-scoped studio layout. Resolves the active channel from the URL
// handle and renders the sticky StudioSubNav with the channel chip + section
// pills above the page content. Auth is enforced at the page level too, but
// this layout fails fast for unauthenticated users so the subnav never
// flashes for guests.
const StudioChannelLayout = async ({ children, params }: Props) => {
    const { handle } = await params;

    let memberships: Awaited<ReturnType<typeof trpc.channel.listMine>>;
    try {
        memberships = await trpc.channel.listMine();
    } catch {
        redirect("/login");
    }

    const lower = handle.toLowerCase();
    const active = memberships.find((c) => c.handle === lower);
    if (!active) {
        notFound();
    }

    // Reduce to the lightweight shape the subnav expects.
    const channels: StudioChannel[] = memberships.map((c) => ({
        id: c.id,
        handle: c.handle,
        name: c.name,
        avatarPath: c.avatarPath,
    }));
    const activeChannel: StudioChannel = {
        id: active.id,
        handle: active.handle,
        name: active.name,
        avatarPath: active.avatarPath,
    };

    return (
        <>
            <StudioSubNav channel={activeChannel} channels={channels} />
            <div className="pt-6">{children}</div>
        </>
    );
};

export default StudioChannelLayout;
