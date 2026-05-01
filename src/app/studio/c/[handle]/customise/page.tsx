import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChannelCustomiseForm } from "@/components/studio/ChannelCustomiseForm";
import { trpc } from "@/lib/trpc/server";

type Props = {
    params: Promise<{ handle: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `@${handle} — Customise channel` };
};

const CustomiseChannelPage = async ({ params }: Props) => {
    const { handle } = await params;

    // Require auth.
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

    // Fetch full channel row (includes avatarPath / bannerPath).
    let channel: Awaited<ReturnType<typeof trpc.channel.byHandle>>;
    try {
        channel = await trpc.channel.byHandle({ handle: handle.toLowerCase() });
    } catch {
        notFound();
    }

    // Only owner / manager may access customisation.
    if (membership.role !== "owner" && membership.role !== "manager") {
        notFound();
    }

    const avatarUrl = channel.avatarPath ? `/api/channel/${channel.id}/asset/avatar` : null;
    const bannerUrl = channel.bannerPath ? `/api/channel/${channel.id}/asset/banner` : null;

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            {/* Page header */}
            <div className="mb-8 flex items-center gap-4">
                <Link
                    href={`/studio/c/${handle}`}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    &#8592; Studio
                </Link>
            </div>

            <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight">Customise channel</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Update your channel&apos;s avatar, banner, and description.
                </p>
            </div>

            <ChannelCustomiseForm
                channelId={channel.id}
                handle={channel.handle}
                initialName={channel.name}
                initialDescription={channel.description}
                avatarUrl={avatarUrl}
                bannerUrl={bannerUrl}
            />
        </main>
    );
};

export default CustomiseChannelPage;
