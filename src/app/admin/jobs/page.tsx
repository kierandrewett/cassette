import { headers } from "next/headers";
import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import { trpc } from "@/lib/trpc/server";
import { JobActionsMenu } from "@/components/admin/JobActionsMenu";

interface SearchParams {
    state?: "queued" | "running" | "completed" | "failed";
}

const STATE_COLOURS: Record<string, string> = {
    queued: "bg-secondary text-secondary-foreground",
    running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-destructive/10 text-destructive",
};

const formatDate = (d: Date | null | undefined) =>
    d
        ? new Date(d).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "—";

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireAdmin(await headers());
    const sp = await searchParams;

    const rows = await trpc.admin.jobs.list({ state: sp.state, limit: 100 });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Transcode jobs</h1>
                    <p className="text-sm text-muted-foreground">
                        {rows.length} job{rows.length !== 1 ? "s" : ""} shown
                    </p>
                </div>
                <form method="GET" className="flex gap-2">
                    <select
                        name="state"
                        defaultValue={sp.state ?? ""}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">All states</option>
                        <option value="queued">Queued</option>
                        <option value="running">Running</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
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
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Video</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">State</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Progress</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Step</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Started</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Finished</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Message</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ job, videoTitle, channelHandle }) => (
                            <tr key={job.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                                <td className="max-w-xs px-4 py-3">
                                    <Link
                                        href={`/watch/${job.videoId}`}
                                        className="line-clamp-1 font-medium hover:underline"
                                    >
                                        {videoTitle}
                                    </Link>
                                    <div className="text-xs text-muted-foreground">@{channelHandle}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATE_COLOURS[job.state] ?? ""}`}
                                    >
                                        {job.state}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">{job.progress}%</td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">{job.step ?? "—"}</td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(job.startedAt)}</td>
                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                    {formatDate(job.finishedAt)}
                                </td>
                                <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-foreground">
                                    {job.message ? job.message.slice(-80) : "—"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <JobActionsMenu videoId={job.videoId} state={job.state} />
                                </td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                                    No jobs found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
