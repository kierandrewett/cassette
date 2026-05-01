"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";

interface ChannelQuotaEditorProps {
    channelId: string;
    currentQuotaBytes: number | null;
}

export const ChannelQuotaEditor = ({ channelId, currentQuotaBytes }: ChannelQuotaEditorProps) => {
    const [quotaGb, setQuotaGb] = useState<string>(
        currentQuotaBytes !== null ? String((currentQuotaBytes / 1_073_741_824).toFixed(2)) : "",
    );
    const [editing, setEditing] = useState(false);

    const setQuota = api.admin.channels.setQuota.useMutation({
        onSuccess: () => {
            toast.success("Quota updated.");
            setEditing(false);
        },
        onError: (err) => {
            toast.error(`Failed to set quota: ${err.message}`);
        },
    });

    const handleSave = () => {
        const quotaBytes = quotaGb.trim() === "" ? null : Math.round(parseFloat(quotaGb) * 1_073_741_824);
        setQuota.mutate({ channelId, quotaBytes });
    };

    if (!editing) {
        return (
            <button
                onClick={() => setEditing(true)}
                className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
                {currentQuotaBytes !== null ? `${(currentQuotaBytes / 1_073_741_824).toFixed(1)} GB limit` : "No limit"}
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1.5">
            <input
                type="number"
                min={0}
                step={0.1}
                value={quotaGb}
                onChange={(e) => setQuotaGb(e.target.value)}
                placeholder="GB (blank = none)"
                autoFocus
                className="w-28 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
                onClick={handleSave}
                disabled={setQuota.isPending}
                className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
                Save
            </button>
            <button
                onClick={() => setEditing(false)}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
                Cancel
            </button>
        </div>
    );
};
