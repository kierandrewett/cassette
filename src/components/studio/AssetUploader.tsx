"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { CloudUploadIcon, RefreshIcon, Delete02Icon } from "hugeicons-react";

import { cn } from "@/lib/utils";

export type AssetKind = "avatar" | "banner";

interface AssetUploaderProps {
    kind: AssetKind;
    channelId: string;
    /** Current asset URL, if any. Displayed as a preview before the user uploads. */
    currentUrl?: string | null;
    /** Called with the new URL after a successful upload, or null after removal. */
    onUpdated?: (url: string | null) => void;
}

type UploadState =
    | { status: "idle" }
    | { status: "uploading"; progress: number }
    | { status: "error"; message: string };

// Maximum sizes match the server-side limits.
const MAX_BYTES: Record<AssetKind, number> = {
    avatar: 5 * 1024 * 1024,
    banner: 10 * 1024 * 1024,
};

const ACCEPT = "image/jpeg,image/png,image/webp";

const LABELS: Record<AssetKind, { title: string; replace: string; remove: string; placeholder: string; hint: string }> =
    {
        avatar: {
            title: "Avatar",
            replace: "Replace",
            remove: "Remove",
            placeholder: "Avatar",
            hint: "Square JPEG, PNG, or WebP — max 5 MB. Recommended 1:1 ratio.",
        },
        banner: {
            title: "Banner",
            replace: "Replace",
            remove: "Remove",
            placeholder: "Banner",
            hint: "Wide JPEG, PNG, or WebP — max 10 MB. Recommended 16:5 ratio.",
        },
    };

// Compact, horizontal asset uploader. A small thumbnail preview on the
// left + a vertical button stack (Upload / Replace / Remove) on the right.
// The preview honours the asset's natural aspect — circular for the avatar,
// 16:9 for the banner — so a glance at the preview tells the user which
// slot they're editing without a card title repeating the same information.
export const AssetUploader = ({ kind, channelId, currentUrl, onUpdated }: AssetUploaderProps) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null);
    const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
    const inputRef = useRef<HTMLInputElement>(null);

    const labels = LABELS[kind];

    const handleFile = useCallback(
        (file: File) => {
            if (file.size > MAX_BYTES[kind]) {
                setUploadState({
                    status: "error",
                    message: `File is too large. Maximum is ${kind === "avatar" ? "5" : "10"} MB.`,
                });
                return;
            }

            const localPreview = URL.createObjectURL(file);
            setPreviewUrl(localPreview);
            setUploadState({ status: "uploading", progress: 0 });

            const formData = new FormData();
            formData.append("kind", kind);
            formData.append("file", file);

            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    setUploadState({ status: "uploading", progress: Math.round((e.loaded / e.total) * 100) });
                }
            });

            xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    let url: string;
                    try {
                        const body = JSON.parse(xhr.responseText) as { url?: string };
                        url = body.url ?? `/api/channel/${channelId}/asset/${kind}`;
                    } catch {
                        url = `/api/channel/${channelId}/asset/${kind}`;
                    }
                    // Append a cache-buster so next/image fetches the new version.
                    const bustedUrl = `${url}?t=${Date.now()}`;
                    setPreviewUrl(bustedUrl);
                    setUploadState({ status: "idle" });
                    URL.revokeObjectURL(localPreview);
                    onUpdated?.(bustedUrl);
                } else {
                    let message = "Upload failed.";
                    try {
                        const body = JSON.parse(xhr.responseText) as { error?: string };
                        if (body.error) message = body.error;
                    } catch {
                        // ignore
                    }
                    setUploadState({ status: "error", message });
                    setPreviewUrl(currentUrl ?? null);
                    URL.revokeObjectURL(localPreview);
                }
            });

            xhr.addEventListener("error", () => {
                setUploadState({ status: "error", message: "Network error during upload." });
                setPreviewUrl(currentUrl ?? null);
                URL.revokeObjectURL(localPreview);
            });

            xhr.open("POST", `/api/channel/${channelId}/asset`);
            xhr.send(formData);
        },
        [channelId, kind, currentUrl, onUpdated],
    );

    const handleRemove = async () => {
        setUploadState({ status: "uploading", progress: 0 });
        try {
            const res = await fetch(`/api/channel/${channelId}/asset?kind=${kind}`, { method: "DELETE" });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                setUploadState({ status: "error", message: body.error ?? "Failed to remove asset." });
                return;
            }
            setPreviewUrl(null);
            setUploadState({ status: "idle" });
            onUpdated?.(null);
        } catch {
            setUploadState({ status: "error", message: "Network error." });
        }
    };

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        // Reset so the same file can be re-selected after removal.
        e.target.value = "";
    };

    const isUploading = uploadState.status === "uploading";

    // Preview surface — circle for avatar, 16:9 rectangle for banner. Both
    // use the same border/bg treatment so the section reads as one
    // component when banner + avatar sit side-by-side.
    const previewClasses = cn(
        "relative shrink-0 overflow-hidden border border-border bg-muted/40",
        kind === "avatar" ? "h-20 w-20 rounded-full" : "h-20 w-36 rounded-lg sm:h-24 sm:w-44",
        isUploading ? "opacity-70" : "",
    );

    return (
        <div className="flex items-start gap-4">
            <div className={previewClasses}>
                {previewUrl ? (
                    <Image
                        src={previewUrl}
                        alt={`${labels.title} preview`}
                        fill
                        className="object-cover"
                        sizes={kind === "avatar" ? "80px" : "176px"}
                        unoptimized
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {labels.placeholder}
                    </div>
                )}
                {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-semibold">
                        {uploadState.progress}%
                    </div>
                )}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={onInputChange}
                aria-hidden="true"
            />

            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{labels.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{labels.hint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    >
                        {previewUrl ? (
                            <RefreshIcon size={14} strokeWidth={1.8} />
                        ) : (
                            <CloudUploadIcon size={14} strokeWidth={1.8} />
                        )}
                        {previewUrl ? labels.replace : "Upload"}
                    </button>
                    {previewUrl && (
                        <button
                            type="button"
                            disabled={isUploading}
                            onClick={() => void handleRemove()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                            <Delete02Icon size={14} strokeWidth={1.8} />
                            {labels.remove}
                        </button>
                    )}
                </div>
                {uploadState.status === "error" && (
                    <p className="mt-2 text-xs text-destructive">{uploadState.message}</p>
                )}
            </div>
        </div>
    );
};
