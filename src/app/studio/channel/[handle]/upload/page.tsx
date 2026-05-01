import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BulkUploadForm } from "@/components/studio/BulkUploadForm";
import { StudioUploadForm } from "@/components/studio/StudioUploadForm";
import { UploadPageTabs } from "@/components/studio/UploadPageTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc/server";

type Props = {
    params: Promise<{ handle: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `Upload — @${handle} — Studio` };
};

const StudioUploadPage = async ({ params }: Props) => {
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

    const channelInfo = { id: membership.id, handle: membership.handle };

    return (
        <div className="mx-auto max-w-3xl">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">Upload video</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Add a new video to <span className="font-medium text-foreground">@{membership.handle}</span>. We
                    accept MP4, WebM, and MKV; transcoding to an HLS ladder happens automatically once the upload
                    finishes.
                </p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Source &amp; metadata</CardTitle>
                    <CardDescription>
                        Drop your file in below, then add a title, description, and tags. You can switch to{" "}
                        <span className="font-medium text-foreground">Bulk</span> to upload multiple files at once.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <UploadPageTabs
                        singleForm={<StudioUploadForm channel={channelInfo} />}
                        bulkForm={<BulkUploadForm channel={channelInfo} />}
                    />
                </CardContent>
            </Card>
        </div>
    );
};

export default StudioUploadPage;
