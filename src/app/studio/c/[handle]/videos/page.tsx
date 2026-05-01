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
        <main className="mx-auto max-w-6xl px-4 py-10">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
                    <p className="mt-1 text-sm text-muted-foreground">@{membership.handle}</p>
                </div>
                <a
                    href={`/studio/c/${handle}/upload`}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    + Upload video
                </a>
            </div>
            <StudioVideoTable channelId={membership.id} videos={videos} />
        </main>
    );
};

export default StudioVideosPage;
