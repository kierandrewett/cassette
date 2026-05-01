"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const editSchema = z.object({
    title: z.string().trim().min(1, "Title is required.").max(200, "Title cannot exceed 200 characters."),
    description: z.string().trim().max(10_000, "Description cannot exceed 10,000 characters.").default(""),
});

type EditValues = z.infer<typeof editSchema>;

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
        defaultValues: { title: video.title, description: video.description },
    });

    // Keep form in sync when the dialog opens for a different video.
    useEffect(() => {
        reset({ title: video.title, description: video.description });
    }, [video.id, video.title, video.description, reset]);

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
        updateMetadata.mutate({ videoId: video.id, ...values });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit video</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
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
                                "flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm resize-none",
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
            </DialogContent>
        </Dialog>
    );
};
