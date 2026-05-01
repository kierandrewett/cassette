"use client";

import { useState } from "react";

import { api } from "@/lib/trpc/client";

interface QuotaPanelProps {
    channelId: string;
    initialUsed: number;
    initialQuota: number | null;
    initialAutoPruneDays: number | null;
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export const QuotaPanel = ({ channelId, initialUsed, initialQuota, initialAutoPruneDays }: QuotaPanelProps) => {
    const [quotaGb, setQuotaGb] = useState<string>(
        initialQuota !== null ? String((initialQuota / 1_073_741_824).toFixed(2)) : "",
    );
    const [pruneDays, setPruneDays] = useState<string>(
        initialAutoPruneDays !== null ? String(initialAutoPruneDays) : "",
    );
    const [quotaError, setQuotaError] = useState<string | null>(null);
    const [quotaSuccess, setQuotaSuccess] = useState(false);
    const [pruneError, setPruneError] = useState<string | null>(null);
    const [pruneSuccess, setPruneSuccess] = useState(false);

    const setMyQuota = api.channel.setMyQuota.useMutation({
        onSuccess: () => {
            setQuotaSuccess(true);
            setQuotaError(null);
        },
        onError: (err) => {
            setQuotaError(err.message);
            setQuotaSuccess(false);
        },
    });

    const setAutoPruneDays = api.channel.setAutoPruneDays.useMutation({
        onSuccess: () => {
            setPruneSuccess(true);
            setPruneError(null);
        },
        onError: (err) => {
            setPruneError(err.message);
            setPruneSuccess(false);
        },
    });

    const usedPercent = initialQuota !== null ? Math.min(100, Math.round((initialUsed / initialQuota) * 100)) : null;

    const handleSaveQuota = (e: React.FormEvent) => {
        e.preventDefault();
        setQuotaSuccess(false);
        setQuotaError(null);
        const quotaBytes = quotaGb.trim() === "" ? null : Math.round(parseFloat(quotaGb) * 1_073_741_824);
        setMyQuota.mutate({ channelId, quotaBytes });
    };

    const handleSavePrune = (e: React.FormEvent) => {
        e.preventDefault();
        setPruneSuccess(false);
        setPruneError(null);
        const days = pruneDays.trim() === "" ? null : parseInt(pruneDays, 10);
        setAutoPruneDays.mutate({ channelId, autoPruneDays: days });
    };

    return (
        <div className="space-y-10">
            {/* Quota section */}
            <section>
                <h2 className="mb-1 text-base font-semibold tracking-tight text-foreground">Storage quota</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                    Limit the total source-file storage this channel may use. Leave blank for no limit.
                </p>

                {/* Usage bar */}
                <div className="mb-4 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{formatBytes(initialUsed)} used</span>
                        {initialQuota !== null && (
                            <span className="text-muted-foreground">of {formatBytes(initialQuota)}</span>
                        )}
                    </div>
                    {initialQuota !== null && usedPercent !== null && (
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${usedPercent}%` }}
                            />
                        </div>
                    )}
                </div>

                <form onSubmit={handleSaveQuota} className="max-w-xs space-y-3">
                    <div className="space-y-1.5">
                        <label htmlFor="quota-gb" className="text-sm font-medium text-foreground">
                            Quota (GB)
                        </label>
                        <input
                            id="quota-gb"
                            type="number"
                            min={0}
                            step={0.1}
                            value={quotaGb}
                            onChange={(e) => setQuotaGb(e.target.value)}
                            placeholder="No limit"
                            disabled={setMyQuota.isPending}
                            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        />
                    </div>

                    {quotaError && <p className="text-sm text-destructive">{quotaError}</p>}
                    {quotaSuccess && <p className="text-sm text-green-600 dark:text-green-400">Quota saved.</p>}

                    <button
                        type="submit"
                        disabled={setMyQuota.isPending}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                        {setMyQuota.isPending ? "Saving…" : "Save quota"}
                    </button>
                </form>
            </section>

            {/* Auto-prune section */}
            <section>
                <h2 className="mb-1 text-base font-semibold tracking-tight text-foreground">Auto-prune</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                    Public videos older than this many days will be deleted automatically. Leave blank to never
                    auto-prune. Private and unlisted videos are never pruned.
                </p>

                <form onSubmit={handleSavePrune} className="max-w-xs space-y-3">
                    <div className="space-y-1.5">
                        <label htmlFor="prune-days" className="text-sm font-medium text-foreground">
                            Days before pruning
                        </label>
                        <input
                            id="prune-days"
                            type="number"
                            min={1}
                            step={1}
                            value={pruneDays}
                            onChange={(e) => setPruneDays(e.target.value)}
                            placeholder="Never"
                            disabled={setAutoPruneDays.isPending}
                            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        />
                    </div>

                    {pruneError && <p className="text-sm text-destructive">{pruneError}</p>}
                    {pruneSuccess && (
                        <p className="text-sm text-green-600 dark:text-green-400">Auto-prune policy saved.</p>
                    )}

                    <button
                        type="submit"
                        disabled={setAutoPruneDays.isPending}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                        {setAutoPruneDays.isPending ? "Saving…" : "Save"}
                    </button>
                </form>
            </section>
        </div>
    );
};
