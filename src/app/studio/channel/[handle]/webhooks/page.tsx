import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { WebhooksPanel } from "@/components/studio/WebhooksPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="mx-auto max-w-3xl">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Receive signed HTTP notifications for transcode and comment events. Each webhook&apos;s secret is
                    revealed once at mint time and used to verify request signatures.
                </p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Endpoints</CardTitle>
                    <CardDescription>
                        Add an HTTPS endpoint, choose which events to subscribe to, and send a test payload to verify
                        delivery.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <WebhooksPanel channelId={membership.id} />
                </CardContent>
            </Card>
        </div>
    );
};

export default WebhooksPage;
