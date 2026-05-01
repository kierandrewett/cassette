"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const schema = z
    .object({
        newPassword: z.string().min(8, "Password must be at least 8 characters.").max(128),
        confirmPassword: z.string().min(1, "Please confirm your password."),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
    });

type FormValues = z.infer<typeof schema>;

type Props = {
    token: string;
};

export const ResetPasswordForm = ({ token }: Props) => {
    const router = useRouter();
    const [serverError, setServerError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (values: FormValues) => {
        setServerError(null);

        const result = await authClient.resetPassword({
            newPassword: values.newPassword,
            token,
        });

        if (result.error) {
            setServerError(result.error.message ?? "Password reset failed. The link may have expired.");
            return;
        }

        router.push("/login");
    };

    return (
        <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
                <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
                        Confirm password
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
                    {errors.confirmPassword && (
                        <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                    )}
                </div>

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
                        "inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2",
                        "text-sm font-medium text-primary-foreground shadow transition-colors",
                        "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    {isSubmitting ? "Resetting…" : "Reset password"}
                </button>
            </form>
        </div>
    );
};
