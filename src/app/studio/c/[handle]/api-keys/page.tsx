import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ApiKeysPanel } from "@/components/studio/ApiKeysPanel";
import { trpc } from "@/lib/trpc/server";

type Props = {
    params: Promise<{ handle: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `API Keys — @${handle} — Studio` };
};

const ApiKeysPage = async ({ params }: Props) => {
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

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <ApiKeysPanel channelId={membership.id} />
        </main>
    );
};

export default ApiKeysPage;
