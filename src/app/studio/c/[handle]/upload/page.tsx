import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BulkUploadForm } from "@/components/studio/BulkUploadForm";
import { StudioUploadForm } from "@/components/studio/StudioUploadForm";
import { UploadPageTabs } from "@/components/studio/UploadPageTabs";
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
        <main className="mx-auto max-w-3xl px-4 py-10">
            <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight">Upload video</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Upload to <span className="font-medium text-foreground">@{membership.handle}</span>
                </p>
            </div>

            <UploadPageTabs
                singleForm={<StudioUploadForm channel={channelInfo} />}
                bulkForm={<BulkUploadForm channel={channelInfo} />}
            />
        </main>
    );
};

export default StudioUploadPage;
