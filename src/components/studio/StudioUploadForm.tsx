"use client";

import { useCallback, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { UploadProgress, type UploadStage } from "@/components/studio/UploadProgress";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChannelInfo = {
    id: string;
    handle: string;
};

type StudioUploadFormProps = {
    channel: ChannelInfo;
};

type PrivacyValue = "public" | "unlisted" | "private";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatFileSize = (bytes: number): string => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${bytes} B`;
};

const stripExtension = (filename: string): string => filename.replace(/\.[^.]+$/, "");

// ---------------------------------------------------------------------------
// Poll uploadStatus until terminal state or error
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StudioUploadForm = ({ channel }: StudioUploadFormProps) => {
    const router = useRouter();
    const utils = api.useUtils();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const captionsInputRef = useRef<HTMLInputElement>(null);
    const xhrRef = useRef<XMLHttpRequest | null>(null);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [captionFiles, setCaptionFiles] = useState<File[]>([]);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [tags, setTags] = useState("");
    const [privacy, setPrivacy] = useState<PrivacyValue>("public");
    const [isDragging, setIsDragging] = useState(false);

    // Upload state
    const [stage, setStage] = useState<UploadStage | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Track XHR start time + loaded bytes for speed calculation
    const uploadStartRef = useRef<{ time: number; loaded: number } | null>(null);

    const handleFileSelect = useCallback((file: File) => {
        setSelectedFile(file);
        setTitle(stripExtension(file.name));
        setStage(null);
    }, []);

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const onCaptionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCaptionFiles(Array.from(e.target.files ?? []));
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => setIsDragging(false);

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const pollTranscode = useCallback(
        (videoId: string) => {
            let attempts = 0;
            const maxAttempts = 900; // 30 minutes at 2s interval

            const poll = async () => {
                if (attempts >= maxAttempts) {
                    setStage({ kind: "failed", message: "Transcoding timed out." });
                    return;
                }
                attempts++;

                try {
                    const status = await utils.video.uploadStatus.fetch({ videoId });

                    if (!status) {
                        // Row not found yet — keep polling
                        setTimeout(() => void poll(), POLL_INTERVAL_MS);
                        return;
                    }

                    const percent = status.progress ?? 0;
                    const step = status.step ?? "processing";

                    if (status.state === "completed") {
                        setStage({ kind: "done" });
                        setTimeout(() => router.push(`/watch/${videoId}`), 1_500);
                        return;
                    }

                    if (status.state === "failed") {
                        setStage({ kind: "failed", message: status.message ?? "Transcoding failed." });
                        return;
                    }

                    // Still in progress
                    setStage({ kind: "transcoding", step, percent });
                    setTimeout(() => void poll(), POLL_INTERVAL_MS);
                } catch {
                    // Network hiccup — keep polling
                    setTimeout(() => void poll(), POLL_INTERVAL_MS);
                }
            };

            void poll();
        },
        [utils, router],
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedFile) {
            toast.error("Please select a video file.");
            return;
        }

        if (!title.trim()) {
            toast.error("Please enter a title.");
            return;
        }

        const formData = new FormData();
        formData.set("title", title.trim());
        formData.set("description", description.trim());
        formData.set("privacy", privacy);
        formData.set("channelId", channel.id);
        if (tags.trim()) formData.set("tags", tags.trim());
        formData.set("file", selectedFile, selectedFile.name);

        for (const cap of captionFiles) {
            formData.append("captions[]", cap, cap.name);
        }

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        setIsUploading(true);
        setStage({ kind: "uploading", bytesPerSec: 0, percent: 0 });
        uploadStartRef.current = { time: Date.now(), loaded: 0 };

        xhr.upload.addEventListener("progress", (ev) => {
            if (!ev.lengthComputable) return;
            const now = Date.now();
            const elapsed = (now - (uploadStartRef.current?.time ?? now)) / 1_000;
            const loaded = ev.loaded;
            const bytesPerSec = elapsed > 0 ? (loaded - (uploadStartRef.current?.loaded ?? 0)) / elapsed : 0;
            const percent = Math.round((ev.loaded / ev.total) * 100);
            setStage({ kind: "uploading", bytesPerSec, percent });
        });

        xhr.addEventListener("load", () => {
            xhrRef.current = null;
            if (xhr.status === 201) {
                let videoId: string | null = null;
                try {
                    const body = JSON.parse(xhr.responseText) as { videoId?: string };
                    videoId = body.videoId ?? null;
                } catch {
                    // fall through
                }

                if (!videoId) {
                    setIsUploading(false);
                    setStage(null);
                    toast.error("Unexpected response from server.");
                    return;
                }

                // Transition to transcode polling stage
                setStage({ kind: "transcoding", step: "queued", percent: 0 });
                pollTranscode(videoId);
            } else {
                setIsUploading(false);
                setStage(null);
                let errorMessage = "Upload failed.";
                try {
                    const body = JSON.parse(xhr.responseText) as { error?: string };
                    if (body.error) errorMessage = body.error;
                } catch {
                    // ignore
                }
                toast.error(errorMessage);
            }
        });

        xhr.addEventListener("error", () => {
            xhrRef.current = null;
            setIsUploading(false);
            setStage(null);
            toast.error("Network error during upload.");
        });

        xhr.addEventListener("abort", () => {
            xhrRef.current = null;
            setIsUploading(false);
            setStage(null);
        });

        xhr.open("POST", `/api/upload?channelId=${encodeURIComponent(channel.id)}`);
        xhr.withCredentials = true;
        xhr.send(formData);
    };

    const handleCancel = () => {
        if (xhrRef.current) {
            xhrRef.current.abort();
        }
        setStage(null);
        setIsUploading(false);
    };

    const isTranscoding = stage?.kind === "transcoding" || stage?.kind === "done";
    const formDisabled = isUploading || isTranscoding;

    return (
        <>
            <Toaster />
            <form onSubmit={handleSubmit} noValidate className="space-y-6">
                {/* File drop zone */}
                {!selectedFile ? (
                    <div
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-16 text-center transition-colors",
                            isDragging
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                        )}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                            className="mb-3 h-10 w-10 opacity-60"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                            />
                        </svg>
                        <p className="text-sm font-medium">Drag and drop a video, or click to browse</p>
                        <p className="mt-1 text-xs opacity-60">MP4, MKV, MOV, WebM and more</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            onChange={onFileInputChange}
                            className="hidden"
                        />
                    </div>
                ) : (
                    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="h-5 w-5 text-muted-foreground"
                            >
                                <path d="M4.5 4.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8.25a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3H4.5ZM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06Z" />
                            </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                        </div>
                        {!formDisabled && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedFile(null);
                                    setTitle("");
                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                )}

                {/* Progress panel */}
                {stage && <UploadProgress stage={stage} />}

                {/* Form fields — hidden while transcoding */}
                {!isTranscoding && (
                    <>
                        {/* Title */}
                        <div className="space-y-1.5">
                            <label htmlFor="upload-title" className="text-sm font-medium leading-none">
                                Title <span className="text-destructive">*</span>
                            </label>
                            <input
                                id="upload-title"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                disabled={formDisabled}
                                placeholder="Video title"
                                className={cn(
                                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    "disabled:pointer-events-none disabled:opacity-50",
                                )}
                            />
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <label htmlFor="upload-description" className="text-sm font-medium leading-none">
                                Description
                            </label>
                            <textarea
                                id="upload-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={formDisabled}
                                rows={5}
                                placeholder="Describe your video…"
                                className={cn(
                                    "flex w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm",
                                    "placeholder:text-muted-foreground",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                    "disabled:cursor-not-allowed disabled:opacity-50",
                                )}
                            />
                        </div>

                        {/* Tags */}
                        <div className="space-y-1.5">
                            <label htmlFor="upload-tags" className="text-sm font-medium leading-none">
                                Tags <span className="font-normal text-muted-foreground">(optional)</span>
                            </label>
                            <input
                                id="upload-tags"
                                type="text"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                disabled={formDisabled}
                                placeholder="Comma-separated, e.g. cooking, knife-skills"
                                className={cn(
                                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    "disabled:pointer-events-none disabled:opacity-50",
                                )}
                            />
                        </div>

                        {/* Privacy */}
                        <div className="space-y-2">
                            <p className="text-sm font-medium leading-none">Visibility</p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                {(["public", "unlisted", "private"] as PrivacyValue[]).map((v) => (
                                    <label
                                        key={v}
                                        className={cn(
                                            "flex flex-1 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                                            privacy === v
                                                ? "border-primary bg-primary/5"
                                                : "border-border hover:border-primary/40",
                                            formDisabled && "cursor-not-allowed opacity-50",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="privacy"
                                            value={v}
                                            checked={privacy === v}
                                            onChange={() => setPrivacy(v)}
                                            disabled={formDisabled}
                                            className="accent-primary"
                                        />
                                        <span className="text-sm font-medium capitalize">{v}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Captions */}
                        <div className="space-y-1.5">
                            <label htmlFor="upload-captions" className="text-sm font-medium leading-none">
                                Captions{" "}
                                <span className="font-normal text-muted-foreground">
                                    (optional, .vtt — name as <code className="text-xs">lang-Label.vtt</code>)
                                </span>
                            </label>
                            <input
                                id="upload-captions"
                                ref={captionsInputRef}
                                type="file"
                                accept=".vtt"
                                multiple
                                onChange={onCaptionsChange}
                                disabled={formDisabled}
                                className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80 disabled:opacity-50"
                            />
                            {captionFiles.length > 0 && (
                                <ul className="space-y-0.5">
                                    {captionFiles.map((f) => (
                                        <li key={f.name} className="text-xs text-muted-foreground">
                                            {f.name}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={formDisabled || !selectedFile}
                                className={cn(
                                    "inline-flex h-10 items-center justify-center rounded-md bg-primary px-6",
                                    "text-sm font-medium text-primary-foreground shadow transition-colors",
                                    "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    "disabled:pointer-events-none disabled:opacity-50",
                                )}
                            >
                                {isUploading ? "Uploading…" : "Upload"}
                            </button>

                            {isUploading && (
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </>
                )}
            </form>
        </>
    );
};
