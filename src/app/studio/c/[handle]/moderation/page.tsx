import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ModerationQueue } from "@/components/studio/ModerationQueue";
import { trpc } from "@/lib/trpc/server";

type Props = {
    params: Promise<{ handle: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
    const { handle } = await params;
    return { title: `@${handle} — Moderation` };
};

const ModerationPage = async ({ params }: Props) => {
    const { handle } = await params;

    // Membership/auth gate. listMine throws UNAUTHORIZED for signed-out
    // users; we treat that as a redirect to /login. We then verify the
    // caller has owner/manager role on the channel — uploaders can't
    // moderate.
    let memberships: Awaited<ReturnType<typeof trpc.channel.listMine>>;
    try {
        memberships = await trpc.channel.listMine();
    } catch {
        redirect("/login");
    }

    const membership = memberships.find((c) => c.handle === handle.toLowerCase());
    if (!membership) notFound();
    if (membership.role !== "owner" && membership.role !== "manager") notFound();

    // Initial server-rendered batch — the client island re-fetches on
    // approve/reject so we don't have to mark this page dynamic.
    const initial = await trpc.comment
        .listPending({ channelId: membership.id, limit: 50 })
        .catch(() => [] as Awaited<ReturnType<typeof trpc.comment.listPending>>);

    return (
        <main className="mx-auto max-w-4xl px-4 py-10">
            <div className="mb-8 flex items-center gap-4">
                <Link
                    href={`/studio/c/${handle}`}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                    &#8592; Studio
                </Link>
            </div>

            <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight">Comment moderation</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Review comments held for moderation on your channel&apos;s videos.
                </p>
            </div>

            <ModerationQueue channelId={membership.id} initialItems={initial} />
        </main>
    );
};

export default ModerationPage;
