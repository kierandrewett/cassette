"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const schema = z.object({
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(1, "Password is required."),
});

type FormValues = z.infer<typeof schema>;

type LoginStep = "credentials" | "totp" | "backup-code";

export const AuthLoginForm = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [serverError, setServerError] = useState<string | null>(null);
    const [step, setStep] = useState<LoginStep>("credentials");

    // 2FA step state
    const [totpCode, setTotpCode] = useState("");
    const [totpError, setTotpError] = useState<string | null>(null);
    const [totpPending, setTotpPending] = useState(false);
    const [backupCode, setBackupCode] = useState("");
    const [backupError, setBackupError] = useState<string | null>(null);
    const [backupPending, setBackupPending] = useState(false);

    // Passkey state
    const [passKeyPending, setPasskeyPending] = useState(false);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    });

    const redirectAfterAuth = () => {
        const next = searchParams.get("next");
        router.push(next ?? "/studio");
        router.refresh();
    };

    const onSubmit = async (values: FormValues) => {
        setServerError(null);

        const result = await authClient.signIn.email({
            email: values.email,
            password: values.password,
        });

        // The twoFactor plugin intercepts the response; when 2FA is required,
        // Better-Auth returns data.twoFactorRedirect === true and does not set
        // a session cookie yet. We detect this and show the TOTP challenge.
        const data = result.data as ({ twoFactorRedirect?: boolean } & Record<string, unknown>) | null;
        if (data?.twoFactorRedirect) {
            setStep("totp");
            return;
        }

        if (result.error) {
            setServerError(result.error.message ?? "Sign-in failed. Please try again.");
            return;
        }

        redirectAfterAuth();
    };

    const handleVerifyTotp = async () => {
        if (totpCode.length !== 6) {
            setTotpError("Please enter the 6-digit code from your authenticator app.");
            return;
        }
        setTotpError(null);
        setTotpPending(true);

        const result = await authClient.twoFactor.verifyTotp({ code: totpCode });

        setTotpPending(false);

        if (result.error) {
            setTotpError(result.error.message ?? "Invalid code. Please try again.");
            return;
        }

        redirectAfterAuth();
    };

    const handleVerifyBackupCode = async () => {
        if (!backupCode.trim()) {
            setBackupError("Please enter a backup code.");
            return;
        }
        setBackupError(null);
        setBackupPending(true);

        const result = await authClient.twoFactor.verifyBackupCode({ code: backupCode.trim() });

        setBackupPending(false);

        if (result.error) {
            setBackupError(result.error.message ?? "Invalid backup code. Please try again.");
            return;
        }

        redirectAfterAuth();
    };

    const handlePasskeySignIn = async () => {
        setPasskeyError(null);
        setPasskeyPending(true);

        const result = await authClient.signIn.passkey();

        setPasskeyPending(false);

        if (result?.error) {
            setPasskeyError(result.error.message ?? "Passkey sign-in failed. Please try again.");
            return;
        }

        redirectAfterAuth();
    };

    // ---- 2FA TOTP challenge --------------------------------------------------
    if (step === "totp") {
        return (
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-1 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
                    <p className="text-sm text-muted-foreground">
                        Enter the 6-digit code from your authenticator app.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="totp-code" className="text-sm font-medium leading-none">
                            Verification code
                        </label>
                        <input
                            id="totp-code"
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            autoComplete="one-time-code"
                            placeholder="000000"
                            maxLength={6}
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                            onKeyDown={(e) => { if (e.key === "Enter") void handleVerifyTotp(); }}
                            className={cn(
                                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors font-mono tracking-widest",
                                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                totpError && "border-destructive focus-visible:ring-destructive",
                            )}
                        />
                        {totpError && <p className="text-xs text-destructive">{totpError}</p>}
                    </div>

                    <button
                        onClick={() => void handleVerifyTotp()}
                        disabled={totpPending || totpCode.length !== 6}
                        className={cn(
                            "inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2",
                            "text-sm font-medium text-primary-foreground shadow transition-colors",
                            "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            "disabled:pointer-events-none disabled:opacity-50",
                        )}
                    >
                        {totpPending ? "Verifying…" : "Verify"}
                    </button>

                    <p className="text-center text-sm text-muted-foreground">
                        Lost your authenticator?{" "}
                        <button
                            type="button"
                            onClick={() => { setStep("backup-code"); setTotpError(null); }}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                            Use a backup code
                        </button>
                    </p>
                </div>
            </div>
        );
    }

    // ---- Backup code challenge -----------------------------------------------
    if (step === "backup-code") {
        return (
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-1 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Backup code</h1>
                    <p className="text-sm text-muted-foreground">
                        Enter one of your saved backup codes.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="backup-code" className="text-sm font-medium leading-none">
                            Backup code
                        </label>
                        <input
                            id="backup-code"
                            type="text"
                            autoFocus
                            autoComplete="off"
                            placeholder="xxxxxx-xxxxxx"
                            value={backupCode}
                            onChange={(e) => setBackupCode(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void handleVerifyBackupCode(); }}
                            className={cn(
                                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors font-mono",
                                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                backupError && "border-destructive focus-visible:ring-destructive",
                            )}
                        />
                        {backupError && <p className="text-xs text-destructive">{backupError}</p>}
                    </div>

                    <button
                        onClick={() => void handleVerifyBackupCode()}
                        disabled={backupPending || !backupCode.trim()}
                        className={cn(
                            "inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2",
                            "text-sm font-medium text-primary-foreground shadow transition-colors",
                            "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            "disabled:pointer-events-none disabled:opacity-50",
                        )}
                    >
                        {backupPending ? "Verifying…" : "Sign in"}
                    </button>

                    <p className="text-center text-sm text-muted-foreground">
                        <button
                            type="button"
                            onClick={() => { setStep("totp"); setBackupError(null); }}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                            Use authenticator app instead
                        </button>
                    </p>
                </div>
            </div>
        );
    }

    // ---- Credentials form ---------------------------------------------------
    return (
        <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
                <p className="text-sm text-muted-foreground">Enter your email and password to continue.</p>
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

                {/* Password */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label htmlFor="password" className="text-sm font-medium leading-none">
                            Password
                        </label>
                        <a
                            href="/forgot-password"
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                        >
                            Forgot password?
                        </a>
                    </div>
                    <input
                        id="password"
                        type="password"
                        autoComplete="current-password"
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
                    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                    {isSubmitting ? "Signing in…" : "Sign in"}
                </button>
            </form>

            {/* Divider */}
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
            </div>

            {/* Passkey sign-in */}
            {passkeyError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {passkeyError}
                </p>
            )}
            <button
                type="button"
                onClick={() => void handlePasskeySignIn()}
                disabled={passKeyPending}
                className={cn(
                    "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2",
                    "text-sm font-medium text-foreground shadow-sm transition-colors",
                    "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-50",
                )}
            >
                {passKeyPending ? "Waiting for passkey…" : "Sign in with passkey"}
            </button>

            <p className="text-center text-sm text-muted-foreground">
                No account?{" "}
                <a href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Create one
                </a>
            </p>
        </div>
    );
};
