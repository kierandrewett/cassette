import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ApiKeysPanel } from "@/components/studio/ApiKeysPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="mx-auto max-w-3xl">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Channel-scoped Better-Auth API keys for the upload pipeline. Treat these like passwords — the
                    plaintext is shown once, at mint time only.
                </p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Manage keys</CardTitle>
                    <CardDescription>
                        Mint a new key, copy it once, and use it as the bearer token for uploads to{" "}
                        <span className="font-medium text-foreground">@{membership.handle}</span>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ApiKeysPanel channelId={membership.id} />
                </CardContent>
            </Card>
        </div>
    );
};

export default ApiKeysPage;
