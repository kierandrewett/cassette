import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { StudioVideoTable } from "@/components/studio/StudioVideoTable";
import { trpc } from "@/lib/trpc/server";

type Props = {
    params: Promise<{ handle: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `Videos — @${handle} — Studio` };
};

const StudioVideosPage = async ({ params }: Props) => {
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

    const { items: videos } = await trpc.video.listForChannel({ channelId: membership.id });

    return (
        <>
            <header className="mb-4">
                <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    All uploads across <span className="font-medium text-foreground">@{membership.handle}</span> —
                    public, unlisted, and private.
                </p>
            </header>
            <StudioVideoTable channelId={membership.id} channelHandle={membership.handle} videos={videos} />
        </>
    );
};

export default StudioVideosPage;
