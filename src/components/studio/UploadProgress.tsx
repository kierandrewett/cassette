"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStage =
    | { kind: "uploading"; bytesPerSec: number; percent: number }
    | { kind: "transcoding"; step: string; percent: number }
    | { kind: "done" }
    | { kind: "failed"; message: string };

type UploadProgressProps = {
    stage: UploadStage;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec >= 1_048_576) return `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1_024) return `${(bytesPerSec / 1_024).toFixed(1)} KB/s`;
    return `${Math.round(bytesPerSec)} B/s`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const UploadProgress = ({ stage }: UploadProgressProps) => {
    if (stage.kind === "done") {
        return (
            <div className="rounded-xl border border-border bg-card p-5 text-center">
                <p className="text-sm font-medium text-green-400">Upload complete — redirecting…</p>
            </div>
        );
    }

    if (stage.kind === "failed") {
        return (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5">
                <p className="text-sm font-medium text-destructive">Transcoding failed</p>
                {stage.message && <p className="mt-1 text-xs text-muted-foreground">{stage.message}</p>}
            </div>
        );
    }

    const isUploading = stage.kind === "uploading";
    const isTranscoding = stage.kind === "transcoding";
    const percent = stage.percent;

    return (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            {/* Stage 1 — Upload */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className={cn("text-sm font-medium", isUploading ? "text-foreground" : "text-muted-foreground")}>
                        Uploading
                    </span>
                    {isUploading && (
                        <span className="text-xs text-muted-foreground">
                            {formatSpeed(stage.bytesPerSec)}
                        </span>
                    )}
                    {!isUploading && (
                        <span className="text-xs text-green-400">Done</span>
                    )}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn(
                            "h-full rounded-full transition-all duration-300",
                            isUploading ? "bg-primary" : "bg-green-500",
                        )}
                        style={{ width: isUploading ? `${percent}%` : "100%" }}
                    />
                </div>
            </div>

            {/* Stage 2 — Transcode */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span
                        className={cn(
                            "text-sm font-medium",
                            isTranscoding ? "text-foreground" : "text-muted-foreground",
                        )}
                    >
                        {isTranscoding ? `Transcoding · ${stage.step}` : "Transcoding"}
                    </span>
                    {isTranscoding && (
                        <span className="text-xs text-muted-foreground">{percent}%</span>
                    )}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                        className={cn(
                            "h-full rounded-full transition-all duration-300",
                            isTranscoding ? "bg-primary" : "bg-muted-foreground/20",
                        )}
                        style={{ width: isTranscoding ? `${percent}%` : "0%" }}
                    />
                </div>
            </div>
        </div>
    );
};
