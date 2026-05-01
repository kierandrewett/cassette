import { headers } from "next/headers";
import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import { trpc } from "@/lib/trpc/server";
import { VideoActionsMenu } from "@/components/admin/VideoActionsMenu";

interface SearchParams {
    q?: string;
    status?: "queued" | "transcoding" | "ready" | "failed";
    privacy?: "public" | "unlisted" | "private";
    channelId?: string;
}

const STATUS_COLOURS: Record<string, string> = {
    queued: "bg-secondary text-secondary-foreground",
    transcoding: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    ready: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-destructive/10 text-destructive",
};

const PRIVACY_COLOURS: Record<string, string> = {
    public: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    unlisted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    private: "bg-secondary text-secondary-foreground",
};

const formatDate = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function AdminVideosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireAdmin(await headers());
    const sp = await searchParams;

    const { items } = await trpc.admin.videos.list({
        q: sp.q,
        status: sp.status,
        privacy: sp.privacy,
        channelId: sp.channelId,
        limit: 50,
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Videos</h1>
                    <p className="text-sm text-muted-foreground">
                        {items.length} video{items.length !== 1 ? "s" : ""} shown
                    </p>
                </div>
                <form method="GET" className="flex flex-wrap gap-2">
                    <input
                        name="q"
                        defaultValue={sp.q ?? ""}
                        placeholder="Search title…"
                        className="w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <select
                        name="status"
                        defaultValue={sp.status ?? ""}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">All statuses</option>
                        <option value="queued">Queued</option>
                        <option value="transcoding">Transcoding</option>
                        <option value="ready">Ready</option>
                        <option value="failed">Failed</option>
                    </select>
                    <select
                        name="privacy"
                        defaultValue={sp.privacy ?? ""}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">All privacy</option>
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="private">Private</option>
                    </select>
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        Filter
                    </button>
                </form>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Channel</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Privacy</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Views</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Uploaded</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(({ video, channelHandle }) => (
                            <tr key={video.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                                <td className="max-w-xs px-4 py-3">
                                    <Link
                                        href={`/watch/${video.id}`}
                                        className="line-clamp-2 font-medium hover:underline"
                                    >
                                        {video.title}
                                    </Link>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">
                                    <Link href={`/c/${channelHandle}`} className="hover:underline">
                                        @{channelHandle}
                                    </Link>
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIVACY_COLOURS[video.privacy] ?? ""}`}
                                    >
                                        {video.privacy}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLOURS[video.status] ?? ""}`}
                                    >
                                        {video.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                    {video.viewCount.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{formatDate(video.createdAt)}</td>
                                <td className="px-4 py-3 text-right">
                                    <VideoActionsMenu
                                        videoId={video.id}
                                        videoTitle={video.title}
                                        videoStatus={video.status}
                                        channelHandle={channelHandle}
                                    />
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                                    No videos found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
