import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { channels } from "@/server/db/schema/channels";

interface AboutTabPageProps {
    params: Promise<{ handle: string }>;
}

// Renders the About tab at /channel/<handle>/about.
const ChannelAboutTabPage = async ({ params }: AboutTabPageProps) => {
    const { handle } = await params;

    const channel = await db
        .select({ description: channels.description })
        .from(channels)
        .where(eq(channels.handle, handle.toLowerCase()))
        .limit(1)
        .then((r) => r[0]);

    if (!channel) notFound();

    return (
        <div className="max-w-2xl space-y-4">
            <h2 className="text-base font-semibold text-foreground">About</h2>
            {channel.description ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{channel.description}</p>
            ) : (
                <p className="text-sm text-muted-foreground">This channel has no description yet.</p>
            )}
        </div>
    );
};

export default ChannelAboutTabPage;
