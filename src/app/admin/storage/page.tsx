import { headers } from "next/headers";

import { requireAdmin } from "@/lib/admin";
import { trpc } from "@/lib/trpc/server";
import { BandwidthSummary } from "@/components/admin/BandwidthSummary";
import { ChannelQuotaEditor } from "@/components/admin/ChannelQuotaEditor";
import { StatCard } from "@/components/admin/StatCard";
import { JanitorButton } from "@/components/admin/JanitorButton";

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export default async function AdminStoragePage() {
    await requireAdmin(await headers());
    const summary = await trpc.admin.storage.summary();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Storage</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    On-disk usage across source files, HLS output, and channel assets.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatCard label="Total" value={formatBytes(summary.totalBytes)} />
                <StatCard label="Source files" value={formatBytes(summary.totalSourceBytes)} />
                <StatCard label="HLS output" value={formatBytes(summary.totalHlsBytes)} />
                <StatCard label="Channel assets" value={formatBytes(summary.totalAssetBytes)} />
            </div>

            {/* Top channels */}
            {summary.topChannels.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-lg font-semibold">Top channels by usage</h2>
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Channel</th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Source</th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">HLS</th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Assets</th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.topChannels.map((ch) => (
                                    <tr
                                        key={ch.channelId}
                                        className="border-b border-border last:border-0 hover:bg-muted/20"
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-medium">{ch.channelName}</span>
                                            {ch.channelHandle && (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    @{ch.channelHandle}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {formatBytes(ch.sourceBytes)}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {formatBytes(ch.hlsBytes)}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {formatBytes(ch.assetBytes)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                                            {formatBytes(ch.totalBytes)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Quotas */}
            {summary.topChannels.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-lg font-semibold">Quotas</h2>
                    <p className="text-sm text-muted-foreground">
                        Per-channel upload quota. Click the quota value to edit inline.
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Channel</th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        Source used
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Quota</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.topChannels.map((ch) => (
                                    <tr
                                        key={ch.channelId}
                                        className="border-b border-border last:border-0 hover:bg-muted/20"
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-medium">{ch.channelName}</span>
                                            {ch.channelHandle && (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    @{ch.channelHandle}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">
                                            {formatBytes(ch.sourceBytes)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <ChannelQuotaEditor
                                                channelId={ch.channelId}
                                                currentQuotaBytes={ch.diskQuotaBytes}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {/* Bandwidth metering */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Bandwidth</h2>
                <p className="text-sm text-muted-foreground">
                    HLS segment bytes served per channel, accumulated from live traffic.
                </p>
                <BandwidthSummary />
            </section>

            {/* Janitor actions */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Janitor</h2>
                <p className="text-sm text-muted-foreground">
                    Sweep on-disk media for orphaned files whose database row has been deleted. Run a dry run first to
                    see what would be removed, then apply.
                </p>
                <div className="flex flex-wrap gap-3">
                    <JanitorButton apply={false} />
                    <JanitorButton apply={true} />
                </div>
            </section>
        </div>
    );
}
