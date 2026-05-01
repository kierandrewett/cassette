import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ApiKeysPanel } from "@/components/studio/ApiKeysPanel";
import { trpc } from "@/lib/trpc/server";

type Props = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ tab?: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `@${handle} — Studio` };
};

const TABS = ["overview", "videos", "api-keys"] as const;
type Tab = (typeof TABS)[number];

const StudioChannelPage = async ({ params, searchParams }: Props) => {
    const { handle } = await params;
    const { tab: rawTab } = await searchParams;
    const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";

    // Require auth; if unauthenticated the caller throws UNAUTHORIZED.
    let channels: Awaited<ReturnType<typeof trpc.channel.listMine>>;
    try {
        channels = await trpc.channel.listMine();
    } catch {
        redirect("/login");
    }

    // Check membership.
    const membership = channels.find((c) => c.handle === handle.toLowerCase());
    if (!membership) {
        notFound();
    }

    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <div className="mb-8 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-base font-semibold uppercase">
                    {membership.name.charAt(0)}
                </div>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{membership.name}</h1>
                    <p className="text-sm text-muted-foreground">@{membership.handle}</p>
                </div>
            </div>

            {/* Tab navigation */}
            <nav className="mb-8 flex gap-1 border-b border-border">
                {TABS.map((t) => (
                    <Link
                        key={t}
                        href={`/studio/c/${handle}?tab=${t}`}
                        className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                            tab === t
                                ? "border-b-2 border-foreground text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {t === "api-keys" ? "API Keys" : t.charAt(0).toUpperCase() + t.slice(1)}
                    </Link>
                ))}
            </nav>

            {/* Tab content */}
            {tab === "overview" && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <Link
                        href={`/studio/c/${handle}/customise`}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-card/80"
                    >
                        <span className="text-base font-semibold">Customise channel</span>
                        <span className="text-sm text-muted-foreground">
                            Update your avatar, banner image, name, and description.
                        </span>
                    </Link>
                </div>
            )}

            {tab === "videos" && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <a
                        href={`/studio/c/${handle}/videos`}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-card/80"
                    >
                        <span className="text-base font-semibold">Manage videos</span>
                        <span className="text-sm text-muted-foreground">
                            View, edit, and manage all your channel videos.
                        </span>
                    </a>
                    <a
                        href={`/studio/c/${handle}/upload`}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-card/80"
                    >
                        <span className="text-base font-semibold">+ Upload video</span>
                        <span className="text-sm text-muted-foreground">
                            Upload a new video to your channel.
                        </span>
                    </a>
                </div>
            )}

            {tab === "api-keys" && <ApiKeysPanel channelId={membership.id} />}
        </main>
    );
};

export default StudioChannelPage;
