"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadState =
    | { status: "idle" }
    | { status: "preview"; previewUrl: string; file: File }
    | { status: "uploading"; previewUrl: string; progress: number }
    | { status: "done"; previewUrl: string }
    | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ThumbnailUploaderProps {
    videoId: string;
    onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export const ThumbnailUploader = ({ videoId, onSaved }: ThumbnailUploaderProps) => {
    const [state, setState] = useState<UploadState>({ status: "idle" });
    const inputRef = useRef<HTMLInputElement>(null);
    const xhrRef = useRef<XMLHttpRequest | null>(null);

    const handleFile = useCallback((file: File) => {
        if (!ACCEPTED.includes(file.type)) {
            toast.error("Only JPEG, PNG or WebP images are accepted.");
            return;
        }
        if (file.size > MAX_BYTES) {
            toast.error("Image must be 5 MB or smaller.");
            return;
        }
        const previewUrl = URL.createObjectURL(file);
        setState({ status: "preview", previewUrl, file });
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        // Reset so the same file can be selected again.
        e.target.value = "";
    };

    const handleUpload = () => {
        if (state.status !== "preview") return;
        const { file, previewUrl } = state;

        const fd = new FormData();
        fd.append("file", file);

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        setState({ status: "uploading", previewUrl, progress: 0 });

        xhr.upload.addEventListener("progress", (ev) => {
            if (ev.lengthComputable) {
                setState({ status: "uploading", previewUrl, progress: Math.round((ev.loaded / ev.total) * 100) });
            }
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                setState({ status: "done", previewUrl });
                toast.success("Thumbnail uploaded.");
                onSaved?.();
            } else {
                let msg = "Upload failed.";
                try {
                    const body = JSON.parse(xhr.responseText) as { error?: string };
                    if (body.error) msg = body.error;
                } catch {
                    // Ignore parse errors.
                }
                setState({ status: "error", message: msg });
                toast.error(msg);
            }
        });

        xhr.addEventListener("error", () => {
            setState({ status: "error", message: "Network error during upload." });
            toast.error("Network error during upload.");
        });

        xhr.open("POST", `/api/upload/${videoId}/thumbnail`);
        xhr.send(fd);
    };

    const handleReset = () => {
        if (xhrRef.current) xhrRef.current.abort();
        setState({ status: "idle" });
    };

    const isDragging = useRef(false);

    if (state.status === "idle") {
        return (
            <div
                className={cn(
                    "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10",
                    "cursor-pointer text-center transition-colors hover:border-primary/50 hover:bg-accent/30",
                )}
                onDragOver={(e) => {
                    e.preventDefault();
                    isDragging.current = true;
                }}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                aria-label="Upload thumbnail image"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                }}
            >
                <UploadCloud className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <div>
                    <p className="text-sm font-medium text-foreground">Drop an image here, or click to browse</p>
                    <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG or WebP &mdash; max 5 MB</p>
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleInputChange}
                    aria-hidden="true"
                />
            </div>
        );
    }

    const previewUrl = state.status !== "error" ? state.previewUrl : "";

    return (
        <div className="space-y-4">
            {/* Image preview */}
            {previewUrl && (
                <div className="overflow-hidden rounded-xl border border-border" style={{ maxWidth: 320 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={previewUrl}
                        alt="Thumbnail preview"
                        className="w-full object-cover"
                        style={{ aspectRatio: "16/9" }}
                    />
                </div>
            )}

            {/* Progress bar */}
            {state.status === "uploading" && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                        className="h-full rounded-full bg-primary transition-[width] duration-150"
                        style={{ width: `${state.progress}%` }}
                    />
                </div>
            )}

            {/* Error message */}
            {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

            {/* Action buttons */}
            <div className="flex gap-2">
                {state.status === "preview" && (
                    <button
                        type="button"
                        onClick={handleUpload}
                        className={cn(
                            "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4",
                            "text-sm font-medium text-primary-foreground shadow transition-colors",
                            "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        )}
                    >
                        Upload
                    </button>
                )}
                {state.status === "done" && (
                    <span className="flex items-center gap-1 text-sm font-medium text-green-500">
                        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                            <path
                                fillRule="evenodd"
                                d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"
                            />
                        </svg>
                        Uploaded
                    </span>
                )}
                <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    {state.status === "done" ? "Replace" : "Cancel"}
                </button>
            </div>
        </div>
    );
};
