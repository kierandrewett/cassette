"use client";

import { api } from "@/lib/trpc/client";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]!}`;
};

const pct = (part: number, total: number): string => {
    if (total === 0) return "0%";
    return `${((part / total) * 100).toFixed(1)}%`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BandwidthSummary = () => {
    const { data, isLoading, isError } = api.admin.bandwidth.summary.useQuery({ days: 14 });

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Loading bandwidth data&hellip;</p>;
    }

    if (isError || !data) {
        return <p className="text-sm text-destructive">Failed to load bandwidth data.</p>;
    }

    const top10 = data.channels.slice(0, 10);
    const topBytes = top10[0]?.bytes ?? 1;

    return (
        <div className="space-y-6">
            {/* Summary stat */}
            <div className="inline-flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total bandwidth (last {data.days} days)
                </span>
                <span className="text-2xl font-bold tabular-nums">{formatBytes(data.grandTotal)}</span>
            </div>

            {/* Bar chart — top 10 channels */}
            {top10.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-base font-semibold">Top channels by bandwidth</h3>
                    <div className="space-y-2">
                        {top10.map((ch) => (
                            <div key={ch.channelId} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="max-w-[240px] truncate font-medium">
                                        {ch.channelName}
                                        <span className="ml-1 text-xs text-muted-foreground">@{ch.channelHandle}</span>
                                    </span>
                                    <span className="ml-4 tabular-nums text-muted-foreground">
                                        {formatBytes(ch.bytes)}
                                    </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                        className="h-2 rounded-full bg-primary"
                                        style={{ width: `${(ch.bytes / topBytes) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Per-channel breakdown table */}
            {data.channels.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-base font-semibold">Channel breakdown</h3>
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Channel</th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        Bytes served
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        % of total
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.channels.map((ch) => (
                                    <tr
                                        key={ch.channelId}
                                        className="border-b border-border last:border-0 hover:bg-muted/20"
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-medium">{ch.channelName}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                @{ch.channelHandle}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">{formatBytes(ch.bytes)}</td>
                                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                            {pct(ch.bytes, data.grandTotal)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {data.channels.length === 0 && (
                <p className="text-sm text-muted-foreground">No bandwidth recorded in the last {data.days} days.</p>
            )}
        </div>
    );
};
