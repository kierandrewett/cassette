"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const schema = z.object({
    name: z.string().min(1, "Name is required.").max(100),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters.").max(128),
});

type FormValues = z.infer<typeof schema>;

export const AuthRegisterForm = () => {
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

        const result = await authClient.signUp.email({
            name: values.name,
            email: values.email,
            password: values.password,
        });

        if (result.error) {
            setServerError(result.error.message ?? "Registration failed. Please try again.");
            return;
        }

        router.push("/studio");
        router.refresh();
    };

    return (
        <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
                <p className="text-sm text-muted-foreground">Fill in the details below to get started.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                    <label htmlFor="name" className="text-sm font-medium leading-none">
                        Display name
                    </label>
                    <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        placeholder="Your name"
                        {...register("name")}
                        className={cn(
                            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            errors.name && "border-destructive focus-visible:ring-destructive",
                        )}
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

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

                {/* Password */}
                <div className="space-y-1.5">
                    <label htmlFor="password" className="text-sm font-medium leading-none">
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        {...register("password")}
                        className={cn(
                            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            errors.password && "border-destructive focus-visible:ring-destructive",
                        )}
                    />
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
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
                    {isSubmitting ? "Creating account…" : "Create account"}
                </button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <a href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Sign in
                </a>
            </p>
        </div>
    );
};
