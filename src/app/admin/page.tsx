import { headers } from "next/headers";
import { BarChart3, Users, Video, MessageSquare, HardDrive, Cpu, AlertTriangle } from "lucide-react";

import { requireAdmin } from "@/lib/admin";
import { trpc } from "@/lib/trpc/server";
import { StatCard } from "@/components/admin/StatCard";

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export default async function AdminOverviewPage() {
    await requireAdmin(await headers());
    const stats = await trpc.admin.stats.overview();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Overview</h1>
                <p className="mt-1 text-sm text-muted-foreground">Platform-wide statistics at a glance.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                <StatCard label="Users" value={stats.userCount.toLocaleString()} icon={Users} href="/admin/users" />
                <StatCard label="Channels" value={stats.channelCount.toLocaleString()} icon={BarChart3} />
                <StatCard
                    label="Videos (ready)"
                    value={stats.videoCount.ready.toLocaleString()}
                    sub={`${stats.videoCount.total.toLocaleString()} total`}
                    icon={Video}
                    href="/admin/videos"
                />
                <StatCard label="Comments" value={stats.commentCount.toLocaleString()} icon={MessageSquare} />
                <StatCard
                    label="Source storage"
                    value={formatBytes(stats.videoBytes)}
                    icon={HardDrive}
                    href="/admin/storage"
                />
                <StatCard
                    label="Pending jobs"
                    value={stats.pendingTranscodeJobs.toLocaleString()}
                    icon={Cpu}
                    href="/admin/jobs"
                />
                <StatCard
                    label="Failed jobs"
                    value={stats.failedTranscodeJobs.toLocaleString()}
                    icon={AlertTriangle}
                    href="/admin/jobs"
                    className={stats.failedTranscodeJobs > 0 ? "border-destructive/50" : ""}
                />
            </div>

            <div className="space-y-2 rounded-lg border border-border p-4">
                <h2 className="text-sm font-semibold">Video status breakdown</h2>
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    {(["queued", "transcoding", "ready", "failed"] as const).map((status) => (
                        <div key={status} className="flex flex-col">
                            <span className="text-xs capitalize text-muted-foreground">{status}</span>
                            <span className="font-semibold tabular-nums">
                                {stats.videoCount[status].toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
