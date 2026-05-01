"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const schema = z
    .object({
        currentPassword: z.string().min(1, "Current password is required."),
        newPassword: z.string().min(8, "New password must be at least 8 characters.").max(128),
        confirmPassword: z.string().min(1, "Please confirm your new password."),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
    });

type FormValues = z.infer<typeof schema>;

export const ChangePasswordForm = () => {
    const [success, setSuccess] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (values: FormValues) => {
        setServerError(null);
        setSuccess(false);

        const result = await authClient.changePassword({
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
            revokeOtherSessions: true,
        });

        if (result.error) {
            setServerError(result.error.message ?? "Password change failed. Please try again.");
            return;
        }

        setSuccess(true);
        reset();
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Current password */}
            <div className="space-y-1.5">
                <label htmlFor="currentPassword" className="text-sm font-medium leading-none">
                    Current password
                </label>
                <input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register("currentPassword")}
                    className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        errors.currentPassword && "border-destructive focus-visible:ring-destructive",
                    )}
                />
                {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
            </div>

            {/* New password */}
            <div className="space-y-1.5">
                <label htmlFor="newPassword" className="text-sm font-medium leading-none">
                    New password
                </label>
                <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...register("newPassword")}
                    className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        errors.newPassword && "border-destructive focus-visible:ring-destructive",
                    )}
                />
                {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-sm font-medium leading-none">
                    Confirm new password
                </label>
                <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    {...register("confirmPassword")}
                    className={cn(
                        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        errors.confirmPassword && "border-destructive focus-visible:ring-destructive",
                    )}
                />
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            {/* Success */}
            {success && (
                <p
                    role="status"
                    className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400"
                >
                    Password updated successfully. Other sessions have been signed out.
                </p>
            )}

            {/* Server error */}
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
                disabled={isSubmitting}
                className={cn(
                    "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                    "text-sm font-medium text-primary-foreground shadow transition-colors",
                    "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-50",
                )}
            >
                {isSubmitting ? "Updating…" : "Update password"}
            </button>
        </form>
    );
};
