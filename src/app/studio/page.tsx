import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateChannelCard } from "@/components/studio/CreateChannelCard";
import { StudioSubNav, type StudioChannel } from "@/components/studio/StudioSubNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/server";

export const metadata: Metadata = {
    title: "Studio",
};

const initialsOf = (name: string): string => name.slice(0, 2).toUpperCase();

const StudioPage = async () => {
    let memberships: Awaited<ReturnType<typeof trpc.channel.listMine>>;
    try {
        memberships = await trpc.channel.listMine();
    } catch {
        redirect("/login");
    }

    const channels: StudioChannel[] = memberships.map((c) => ({
        id: c.id,
        handle: c.handle,
        name: c.name,
        avatarPath: c.avatarPath,
    }));

    return (
        <>
            <StudioSubNav channels={channels} />

            <div className="pt-6">
                <header className="mb-8">
                    <h1 className="text-3xl font-semibold tracking-tight">Studio</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Manage your channels, uploads, and analytics in one place.
                    </p>
                </header>

                {memberships.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
                        <p className="max-w-md text-sm text-muted-foreground">
                            You don&apos;t have any channels yet. Create one to start uploading videos.
                        </p>
                        <CreateChannelCard />
                    </div>
                ) : (
                    <section className="space-y-4">
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                                Your channels
                            </h2>
                            <Link
                                href="/account/channels"
                                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                            >
                                + New channel
                            </Link>
                        </div>
                        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {memberships.map((channel) => {
                                const avatarUrl = channel.avatarPath ? `/api/channel/${channel.id}/asset/avatar` : null;
                                return (
                                    <li key={channel.id}>
                                        <Link
                                            href={`/studio/channel/${channel.handle}`}
                                            className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-foreground/20 hover:bg-accent/40"
                                        >
                                            <Avatar className="h-12 w-12">
                                                {avatarUrl && <AvatarImage src={avatarUrl} alt={channel.name} />}
                                                <AvatarFallback className="text-sm font-semibold uppercase">
                                                    {initialsOf(channel.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-medium">{channel.name}</p>
                                                <p className="truncate text-sm text-muted-foreground">
                                                    @{channel.handle}
                                                </p>
                                            </div>
                                            <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs capitalize text-muted-foreground">
                                                {channel.role}
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </div>
        </>
    );
};

export default StudioPage;
