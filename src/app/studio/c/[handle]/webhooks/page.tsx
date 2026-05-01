import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { WebhooksPanel } from "@/components/studio/WebhooksPanel";
import { trpc } from "@/lib/trpc/server";

type Props = {
    params: Promise<{ handle: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `Webhooks — @${handle} — Studio` };
};

const WebhooksPage = async ({ params }: Props) => {
    const { handle } = await params;

    let channels: Awaited<ReturnType<typeof trpc.channel.listMine>>;
    try {
        channels = await trpc.channel.listMine();
    } catch {
        redirect("/login");
    }

    const membership = channels.find((c) => c.handle === handle.toLowerCase());
    if (!membership) {
        notFound();
    }

    // Only owners and managers may manage webhooks.
    if (membership.role !== "owner" && membership.role !== "manager") {
        notFound();
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <WebhooksPanel channelId={membership.id} />
        </main>
    );
};

export default WebhooksPage;
