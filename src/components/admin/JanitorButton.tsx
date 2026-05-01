"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

interface JanitorResult {
    apply: boolean;
    hlsKept: number;
    hlsRemoved: number;
    assetsRemoved: number;
    sourceKept: number;
    sourceRemoved: number;
    log: string[];
}

export const JanitorButton = ({ apply }: { apply: boolean }) => {
    const [result, setResult] = useState<JanitorResult | null>(null);

    const run = api.admin.storage.runJanitor.useMutation({
        onSuccess: (data) => setResult(data),
    });

    return (
        <div className="space-y-3">
            <Button
                variant={apply ? "destructive" : "outline"}
                disabled={run.isPending}
                onClick={() => run.mutate({ apply })}
                className="gap-2"
            >
                <Trash2 className="h-4 w-4" />
                {apply ? "Run janitor (apply)" : "Run janitor (dry run)"}
            </Button>

            {result && (
                <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
                    <p className="font-medium">{result.apply ? "Applied" : "Dry run"} — results:</p>
                    <ul className="space-y-1 text-muted-foreground">
                        <li>
                            HLS kept: {result.hlsKept}, removed: {result.hlsRemoved}
                        </li>
                        <li>Assets removed: {result.assetsRemoved}</li>
                        <li>
                            Source kept: {result.sourceKept}, removed: {result.sourceRemoved}
                        </li>
                    </ul>
                    {result.log.length > 0 && (
                        <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                Show log ({result.log.length} entries)
                            </summary>
                            <pre className="mt-2 max-h-48 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">
                                {result.log.join("\n")}
                            </pre>
                        </details>
                    )}
                </div>
            )}
        </div>
    );
};
