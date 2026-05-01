"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const schema = z.object({
    email: z.string().email("Enter a valid email address."),
});

type FormValues = z.infer<typeof schema>;

export const ForgotPasswordForm = () => {
    const [submitted, setSubmitted] = useState(false);
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

        const result = await authClient.requestPasswordReset({
            email: values.email,
            redirectTo: "/reset-password",
        });

        if (result.error) {
            // Surface unexpected errors but keep the generic success message
            // for not-found cases to avoid leaking account existence.
            setServerError(result.error.message ?? "Something went wrong. Please try again.");
            return;
        }

        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-1 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
                    <p className="text-sm text-muted-foreground">
                        If that account exists, we&apos;ve sent a reset link. Check your email and follow the
                        instructions. The link expires in 1&nbsp;hour.
                    </p>
                </div>
                <p className="text-center text-sm text-muted-foreground">
                    <a href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                        Back to sign in
                    </a>
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Forgot password?</h1>
                <p className="text-sm text-muted-foreground">
                    Enter the email address associated with your account and we&apos;ll send you a reset link.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                    <label htmlFor="email" className="text-sm font-medium leading-none">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...register("email")}
                        className={cn(
                            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            errors.email && "border-destructive focus-visible:ring-destructive",
                        )}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
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
                    {isSubmitting ? "Sending…" : "Send reset link"}
                </button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
                <a href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Back to sign in
                </a>
            </p>
        </div>
    );
};
