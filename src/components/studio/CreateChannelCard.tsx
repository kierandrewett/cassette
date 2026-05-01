"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { isValidHandle } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { api } from "@/lib/trpc/client";

const schema = z.object({
    handle: z
        .string()
        .min(3, "Handle must be at least 3 characters.")
        .max(30, "Handle must be 30 characters or fewer.")
        .refine(isValidHandle, {
            message: "Handle may only contain lowercase letters, digits, hyphens, and underscores.",
        }),
    name: z.string().min(1, "Channel name is required.").max(100),
    description: z.string().max(2000).default(""),
});

type FormValues = z.infer<typeof schema>;

export const CreateChannelCard = () => {
    const router = useRouter();
    const [serverError, setServerError] = useState<string | null>(null);

    const createChannel = api.channel.create.useMutation({
        onSuccess: (channel) => {
            router.push(`/studio/c/${channel.handle}`);
            router.refresh();
        },
        onError: (err) => {
            setServerError(err.message ?? "Failed to create channel. Please try again.");
        },
    });

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { description: "" },
    });

    const onSubmit = async (values: FormValues) => {
        setServerError(null);
        await createChannel.mutateAsync({
            handle: values.handle.toLowerCase(),
            name: values.name,
            description: values.description,
        });
    };

    return (
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold">Create your first channel</h2>
            <p className="mb-5 text-sm text-muted-foreground">
                A channel is where your videos live. You can create more later.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* Handle */}
                <div className="space-y-1.5">
                    <label htmlFor="handle" className="text-sm font-medium leading-none">
                        Handle
                    </label>
                    <div className="flex items-center">
                        <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                            @
                        </span>
                        <input
                            id="handle"
                            type="text"
                            autoComplete="off"
                            placeholder="mychannel"
                            {...register("handle")}
                            className={cn(
                                "flex h-9 w-full rounded-r-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                errors.handle && "border-destructive focus-visible:ring-destructive",
                            )}
                        />
                    </div>
                    {errors.handle && <p className="text-xs text-destructive">{errors.handle.message}</p>}
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                    <label htmlFor="channelName" className="text-sm font-medium leading-none">
                        Channel name
                    </label>
                    <input
                        id="channelName"
                        type="text"
                        autoComplete="off"
                        placeholder="My Channel"
                        {...register("name")}
                        className={cn(
                            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            errors.name && "border-destructive focus-visible:ring-destructive",
                        )}
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                    <label htmlFor="description" className="text-sm font-medium leading-none">
                        Description <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <textarea
                        id="description"
                        rows={3}
                        placeholder="What's this channel about?"
                        {...register("description")}
                        className={cn(
                            "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            "resize-none",
                        )}
                    />
                </div>

                {serverError && (
                    <p
                        role="alert"
                        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                        {serverError}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={isSubmitting || createChannel.isPending}
                    className={cn(
                        "inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2",
                        "text-sm font-medium text-primary-foreground shadow transition-colors",
                        "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    {createChannel.isPending ? "Creating…" : "Create channel"}
                </button>
            </form>
        </div>
    );
};
