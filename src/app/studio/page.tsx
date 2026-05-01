import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateChannelCard } from "@/components/studio/CreateChannelCard";
import { trpc } from "@/lib/trpc/server";

export const metadata: Metadata = {
    title: "Studio",
};

const StudioPage = async () => {
    // Redirect unauthenticated users; the server caller throws UNAUTHORIZED which
    // we can catch, or we can check the session directly via the context.
    let channels: Awaited<ReturnType<typeof trpc.channel.listMine>>;
    try {
        channels = await trpc.channel.listMine();
    } catch {
        redirect("/login");
    }

    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <h1 className="mb-8 text-3xl font-semibold tracking-tight">Studio</h1>

            {channels.length === 0 ? (
                // Empty state: prompt the user to create their first channel.
                <div className="flex flex-col items-center justify-center gap-4 py-16">
                    <p className="text-center text-muted-foreground">
                        You don&apos;t have any channels yet. Create one to get started.
                    </p>
                    <CreateChannelCard />
                </div>
            ) : (
                <section className="space-y-3">
                    <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                        Your channels
                    </h2>
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {channels.map((channel) => (
                            <li key={channel.id}>
                                <Link
                                    href={`/studio/c/${channel.handle}`}
                                    className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:bg-accent"
                                >
                                    {/* Avatar placeholder */}
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                                        {channel.name.charAt(0)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{channel.name}</p>
                                        <p className="truncate text-sm text-muted-foreground">@{channel.handle}</p>
                                    </div>
                                    <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs capitalize text-muted-foreground">
                                        {channel.role}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
};

export default StudioPage;
