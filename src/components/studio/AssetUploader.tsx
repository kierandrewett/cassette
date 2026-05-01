"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

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

const LABELS: Record<AssetKind, { replace: string; remove: string; drop: string; hint: string }> = {
    avatar: {
        replace: "Replace avatar",
        remove: "Remove avatar",
        drop: "Click or drag to upload avatar",
        hint: "JPEG, PNG, or WebP · max 5 MB",
    },
    banner: {
        replace: "Replace banner",
        remove: "Remove banner",
        drop: "Click or drag to upload banner",
        hint: "JPEG, PNG, or WebP · max 10 MB",
    },
};

export const AssetUploader = ({ kind, channelId, currentUrl, onUpdated }: AssetUploaderProps) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null);
    const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
    const [isDragging, setIsDragging] = useState(false);
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
                    onUpdated?.(url);
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

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => setIsDragging(false);

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    const isUploading = uploadState.status === "uploading";

    if (kind === "avatar") {
        return (
            <div className="flex flex-col items-start gap-3">
                {/* Circular drop zone */}
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={previewUrl ? labels.replace : labels.drop}
                    onClick={() => !isUploading && inputRef.current?.click()}
                    onKeyDown={(e) => e.key === "Enter" && !isUploading && inputRef.current?.click()}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={[
                        "relative h-24 w-24 cursor-pointer overflow-hidden rounded-full border-2 bg-secondary transition-colors",
                        isDragging ? "border-primary" : "border-border hover:border-primary/60",
                        isUploading ? "pointer-events-none opacity-60" : "",
                    ].join(" ")}
                >
                    {previewUrl ? (
                        <Image
                            src={previewUrl}
                            alt="Avatar preview"
                            fill
                            className="object-cover"
                            sizes="96px"
                            unoptimized
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            Avatar
                        </div>
                    )}

                    {/* Upload-progress overlay */}
                    {isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                            <span className="text-xs font-medium">{uploadState.progress}%</span>
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

                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => inputRef.current?.click()}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                        {previewUrl ? labels.replace : "Upload avatar"}
                    </button>
                    {previewUrl && (
                        <button
                            type="button"
                            disabled={isUploading}
                            onClick={() => void handleRemove()}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                            {labels.remove}
                        </button>
                    )}
                </div>

                <p className="text-xs text-muted-foreground">{labels.hint}</p>
                {uploadState.status === "error" && (
                    <p className="text-xs text-destructive">{uploadState.message}</p>
                )}
            </div>
        );
    }

    // Banner — wide rectangular drop zone
    return (
        <div className="flex flex-col gap-3">
            <div
                role="button"
                tabIndex={0}
                aria-label={previewUrl ? labels.replace : labels.drop}
                onClick={() => !isUploading && inputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && !isUploading && inputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={[
                    "group relative h-40 w-full cursor-pointer overflow-hidden rounded-xl border-2 bg-secondary/60 transition-colors sm:h-52",
                    isDragging ? "border-primary" : "border-border hover:border-primary/60",
                    isUploading ? "pointer-events-none opacity-60" : "",
                ].join(" ")}
            >
                {previewUrl && (
                    <Image
                        src={previewUrl}
                        alt="Banner preview"
                        fill
                        className="object-cover"
                        sizes="100vw"
                        unoptimized
                    />
                )}

                {/* Overlay — always slightly visible, prominent on hover */}
                <div
                    className={[
                        "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/60 transition-opacity",
                        previewUrl ? "opacity-0 group-hover:opacity-100" : "opacity-100",
                    ].join(" ")}
                >
                    <span className="text-sm font-medium text-foreground">
                        {previewUrl ? labels.replace : labels.drop}
                    </span>
                    <span className="text-xs text-muted-foreground">{labels.hint}</span>
                </div>

                {/* Upload-progress overlay */}
                {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                        <span className="text-sm font-medium">{uploadState.progress}%</span>
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

            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => inputRef.current?.click()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
                >
                    {previewUrl ? labels.replace : "Upload banner"}
                </button>
                {previewUrl && (
                    <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => void handleRemove()}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                    >
                        {labels.remove}
                    </button>
                )}
            </div>

            {uploadState.status === "error" && (
                <p className="text-xs text-destructive">{uploadState.message}</p>
            )}
        </div>
    );
};
