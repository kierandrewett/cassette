"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThumbnailPicker } from "@/components/studio/ThumbnailPicker";
import { ThumbnailUploader } from "@/components/studio/ThumbnailUploader";
import { ChapterEditor } from "@/components/studio/ChapterEditor";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const TAG_RE = /^[a-z0-9-]*$/;

const editSchema = z.object({
    title: z.string().trim().min(1, "Title is required.").max(200, "Title cannot exceed 200 characters."),
    description: z.string().trim().max(10_000, "Description cannot exceed 10,000 characters.").default(""),
    tagsRaw: z.string().default(""),
});

type EditValues = z.infer<typeof editSchema>;

/**
 * Parse a comma-separated tags string into a validated array.
 * Same rules as the server: lower-case, [a-z0-9-], ≤30 chars, ≤12 tags.
 */
const parseTagsInput = (raw: string): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const part of raw.split(",")) {
        const tag = part.trim().toLowerCase().slice(0, 30);
        if (!tag || !TAG_RE.test(tag) || seen.has(tag)) continue;
        seen.add(tag);
        result.push(tag);
        if (result.length >= 12) break;
    }
    return result;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type EditVideoDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelId: string;
    video: {
        id: string;
        title: string;
        description: string;
        tags?: string[];
        /** Chapters for the manual editor — optional for backwards compat. */
        chapters?: Array<{ startSec: number; title: string; source: string }>;
    };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EditVideoDialog = ({ open, onOpenChange, channelId, video }: EditVideoDialogProps) => {
    const utils = api.useUtils();

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<EditValues>({
        resolver: zodResolver(editSchema),
        defaultValues: {
            title: video.title,
            description: video.description,
            tagsRaw: (video.tags ?? []).join(", "),
        },
    });

    // Keep form in sync when the dialog opens for a different video.
    useEffect(() => {
        reset({
            title: video.title,
            description: video.description,
            tagsRaw: (video.tags ?? []).join(", "),
        });
    }, [video.id, video.title, video.description, video.tags, reset]);

    const updateMetadata = api.video.updateMetadata.useMutation({
        onSuccess: async () => {
            await utils.video.listForChannel.invalidate({ channelId });
            onOpenChange(false);
            toast.success("Video updated.");
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to update video.");
        },
    });

    const onSubmit = (values: EditValues) => {
        const tags = parseTagsInput(values.tagsRaw);
        updateMetadata.mutate({ videoId: video.id, title: values.title, description: values.description, tags });
    };

    // Sub-tab for the thumbnail section.
    const [thumbTab, setThumbTab] = useState<"pick" | "upload">("pick");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit video</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="metadata">
                    <TabsList>
                        <TabsTrigger value="metadata">Metadata</TabsTrigger>
                        <TabsTrigger value="thumbnail">Thumbnail</TabsTrigger>
                        <TabsTrigger value="chapters">Chapters</TabsTrigger>
                    </TabsList>

                    {/* ---- Metadata tab ---- */}
                    <TabsContent value="metadata">
                        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 pt-2">
                            {/* Title */}
                            <div className="space-y-1.5">
                                <label htmlFor="edit-title" className="text-sm font-medium leading-none">
                                    Title <span className="text-destructive">*</span>
                                </label>
                                <input
                                    id="edit-title"
                                    type="text"
                                    {...register("title")}
                                    className={cn(
                                        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                        errors.title && "border-destructive focus-visible:ring-destructive",
                                    )}
                                />
                                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label htmlFor="edit-description" className="text-sm font-medium leading-none">
                                    Description
                                </label>
                                <textarea
                                    id="edit-description"
                                    rows={6}
                                    {...register("description")}
                                    className={cn(
                                        "flex w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm",
                                        "placeholder:text-muted-foreground",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                        "disabled:cursor-not-allowed disabled:opacity-50",
                                        errors.description && "border-destructive",
                                    )}
                                />
                                {errors.description && (
                                    <p className="text-xs text-destructive">{errors.description.message}</p>
                                )}
                            </div>

                            {/* Tags */}
                            <div className="space-y-1.5">
                                <label htmlFor="edit-tags" className="text-sm font-medium leading-none">
                                    Tags <span className="font-normal text-muted-foreground">(optional)</span>
                                </label>
                                <input
                                    id="edit-tags"
                                    type="text"
                                    {...register("tagsRaw")}
                                    placeholder="Comma-separated, e.g. cooking, knife-skills"
                                    className={cn(
                                        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    )}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Lowercase letters, numbers and hyphens only. Up to 12 tags, each ≤ 30 characters.
                                </p>
                            </div>

                            <DialogFooter>
                                <button
                                    type="button"
                                    onClick={() => onOpenChange(false)}
                                    className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || updateMetadata.isPending}
                                    className={cn(
                                        "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4",
                                        "text-sm font-medium text-primary-foreground shadow transition-colors",
                                        "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                        "disabled:pointer-events-none disabled:opacity-50",
                                    )}
                                >
                                    {updateMetadata.isPending ? "Saving…" : "Save changes"}
                                </button>
                            </DialogFooter>
                        </form>
                    </TabsContent>

                    {/* ---- Thumbnail tab ---- */}
                    <TabsContent value="thumbnail" className="pt-2">
                        {/* Sub-tabs: pick from video | upload custom */}
                        <div className="mb-4 flex w-fit gap-1 rounded-lg border border-border bg-secondary p-1">
                            <button
                                type="button"
                                onClick={() => setThumbTab("pick")}
                                className={cn(
                                    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                                    thumbTab === "pick"
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                Pick from video
                            </button>
                            <button
                                type="button"
                                onClick={() => setThumbTab("upload")}
                                className={cn(
                                    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                                    thumbTab === "upload"
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                Upload custom
                            </button>
                        </div>

                        {thumbTab === "pick" ? (
                            <ThumbnailPicker
                                videoId={video.id}
                                onSaved={async () => {
                                    await utils.video.listForChannel.invalidate({ channelId });
                                }}
                            />
                        ) : (
                            <ThumbnailUploader
                                videoId={video.id}
                                onSaved={async () => {
                                    await utils.video.listForChannel.invalidate({ channelId });
                                }}
                            />
                        )}

                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-transparent px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                Close
                            </button>
                        </div>
                    </TabsContent>

                    {/* ---- Chapters tab ---- */}
                    <TabsContent value="chapters">
                        <ChapterEditor
                            videoId={video.id}
                            channelId={channelId}
                            initialChapters={video.chapters ?? []}
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
