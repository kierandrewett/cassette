"use client";

import { useCallback, useEffect, useState } from "react";

import QRCode from "qrcode";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step =
    | "idle"
    | "entering-password-enable"
    | "showing-qr"
    | "verifying-totp"
    | "showing-backup-codes"
    | "entering-password-disable"
    | "entering-password-regenerate";

interface Props {
    /** Whether the authenticated user currently has 2FA enabled. */
    twoFactorEnabled: boolean;
}

// ---------------------------------------------------------------------------
// QR Code renderer — converts a TOTP URI into a data-URL PNG.
// ---------------------------------------------------------------------------

const useQrDataUrl = (uri: string | null): string | null => {
    const [dataUrl, setDataUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!uri) {
            setDataUrl(null);
            return;
        }
        void QRCode.toDataURL(uri, { width: 200, margin: 2 }).then(setDataUrl);
    }, [uri]);

    return dataUrl;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TwoFactorPanel = ({ twoFactorEnabled: initialEnabled }: Props) => {
    const [enabled, setEnabled] = useState(initialEnabled);
    const [step, setStep] = useState<Step>("idle");

    // Shared password field used for enable/disable flows.
    const [password, setPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);

    // Enable flow state
    const [totpUri, setTotpUri] = useState<string | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [totpCode, setTotpCode] = useState("");
    const [totpError, setTotpError] = useState<string | null>(null);

    // General status
    const [pending, setPending] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const qrDataUrl = useQrDataUrl(totpUri);

    const reset = useCallback(() => {
        setStep("idle");
        setPassword("");
        setPasswordError(null);
        setTotpUri(null);
        setBackupCodes([]);
        setTotpCode("");
        setTotpError(null);
        setServerError(null);
        setPending(false);
    }, []);

    // ---- Enable flow -------------------------------------------------------

    const handleEnableSubmitPassword = async () => {
        if (!password) {
            setPasswordError("Password is required.");
            return;
        }
        setPasswordError(null);
        setServerError(null);
        setPending(true);

        const result = await authClient.twoFactor.enable({ password });

        setPending(false);

        if (result.error) {
            setServerError(result.error.message ?? "Failed to enable 2FA. Please try again.");
            return;
        }

        // Better-Auth returns totpURI and backupCodes on successful enable.
        const data = result.data as { totpURI?: string; backupCodes?: string[] } | null;
        if (data?.totpURI) {
            setTotpUri(data.totpURI);
            if (data.backupCodes) setBackupCodes(data.backupCodes);
            setStep("showing-qr");
        } else {
            setServerError("Unexpected response from server. Please try again.");
        }
    };

    const handleVerifyTotp = async () => {
        if (totpCode.length !== 6) {
            setTotpError("Please enter the 6-digit code from your authenticator app.");
            return;
        }
        setTotpError(null);
        setPending(true);

        const result = await authClient.twoFactor.verifyTotp({ code: totpCode });

        setPending(false);

        if (result.error) {
            setTotpError(result.error.message ?? "Invalid code. Please try again.");
            return;
        }

        setEnabled(true);
        setStep("showing-backup-codes");
    };

    // ---- Disable flow ------------------------------------------------------

    const handleDisable = async () => {
        if (!password) {
            setPasswordError("Password is required.");
            return;
        }
        setPasswordError(null);
        setServerError(null);
        setPending(true);

        const result = await authClient.twoFactor.disable({ password });

        setPending(false);

        if (result.error) {
            setServerError(result.error.message ?? "Failed to disable 2FA. Please try again.");
            return;
        }

        setEnabled(false);
        reset();
    };

    // ---- Regenerate backup codes -------------------------------------------

    const handleRegenerateBackupCodes = async () => {
        if (!password) {
            setPasswordError("Password is required.");
            return;
        }
        setPasswordError(null);
        setServerError(null);
        setPending(true);

        const result = await authClient.twoFactor.generateBackupCodes({ password });

        setPending(false);

        if (result.error) {
            setServerError(result.error.message ?? "Failed to regenerate backup codes. Please try again.");
            return;
        }

        const data = result.data as { backupCodes?: string[] } | null;
        setBackupCodes(data?.backupCodes ?? []);
        setStep("showing-backup-codes");
    };

    // ---- Render ------------------------------------------------------------

    return (
        <div className="space-y-4">
            {/* Status indicator */}
            <div className="flex items-center gap-2">
                <span
                    className={cn(
                        "inline-flex h-2 w-2 rounded-full",
                        enabled ? "bg-green-500" : "bg-muted-foreground/40",
                    )}
                />
                <span className="text-sm text-muted-foreground">
                    {enabled ? "Two-factor authentication is enabled." : "Two-factor authentication is disabled."}
                </span>
            </div>

            {/* Server error banner */}
            {serverError && (
                <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                    {serverError}
                </p>
            )}

            {/* ---- IDLE state -------------------------------------------- */}
            {step === "idle" && !enabled && (
                <button
                    onClick={() => {
                        setStep("entering-password-enable");
                        setPassword("");
                        setPasswordError(null);
                    }}
                    className={cn(
                        "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                        "text-sm font-medium text-primary-foreground shadow transition-colors",
                        "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    )}
                >
                    Enable 2FA
                </button>
            )}

            {step === "idle" && enabled && (
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => {
                            setStep("entering-password-regenerate");
                            setPassword("");
                            setPasswordError(null);
                        }}
                        className={cn(
                            "inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 py-2",
                            "text-sm font-medium text-foreground shadow-sm transition-colors",
                            "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        )}
                    >
                        Regenerate backup codes
                    </button>
                    <button
                        onClick={() => {
                            setStep("entering-password-disable");
                            setPassword("");
                            setPasswordError(null);
                        }}
                        className={cn(
                            "inline-flex h-9 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2",
                            "text-sm font-medium text-destructive shadow-sm transition-colors",
                            "hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive",
                        )}
                    >
                        Disable 2FA
                    </button>
                </div>
            )}

            {/* ---- Enter password to ENABLE -------------------------------- */}
            {step === "entering-password-enable" && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Enter your current password to begin setting up 2FA.
                    </p>
                    <div className="space-y-1.5">
                        <label htmlFor="2fa-enable-password" className="text-sm font-medium leading-none">
                            Current password
                        </label>
                        <input
                            id="2fa-enable-password"
                            type="password"
                            autoFocus
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleEnableSubmitPassword();
                            }}
                            className={cn(
                                "flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                passwordError && "border-destructive focus-visible:ring-destructive",
                            )}
                        />
                        {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={reset}
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => void handleEnableSubmitPassword()}
                            disabled={pending}
                            className={cn(
                                "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                                "text-sm font-medium text-primary-foreground shadow transition-colors",
                                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            {pending ? "Verifying…" : "Continue"}
                        </button>
                    </div>
                </div>
            )}

            {/* ---- QR code display ---------------------------------------- */}
            {step === "showing-qr" && (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Scan this QR code with your authenticator app (e.g. 1Password, Authy, Google Authenticator).
                    </p>
                    <div className="flex flex-col items-start gap-3">
                        {qrDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={qrDataUrl}
                                alt="TOTP QR code"
                                width={200}
                                height={200}
                                className="rounded-md border border-border bg-white p-1"
                            />
                        ) : (
                            <div className="h-[200px] w-[200px] animate-pulse rounded-md border border-border bg-muted" />
                        )}
                        <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer select-none">
                                Can&apos;t scan? Copy the URI manually.
                            </summary>
                            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-[10px]">
                                {totpUri}
                            </code>
                        </details>
                    </div>
                    <button
                        onClick={() => setStep("verifying-totp")}
                        className={cn(
                            "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                            "text-sm font-medium text-primary-foreground shadow transition-colors",
                            "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        )}
                    >
                        I&apos;ve scanned it — continue
                    </button>
                </div>
            )}

            {/* ---- TOTP verification -------------------------------------- */}
            {step === "verifying-totp" && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Enter the 6-digit code from your authenticator app to confirm setup.
                    </p>
                    <div className="space-y-1.5">
                        <label htmlFor="totp-verify-code" className="text-sm font-medium leading-none">
                            Verification code
                        </label>
                        <input
                            id="totp-verify-code"
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            autoComplete="one-time-code"
                            placeholder="000000"
                            maxLength={6}
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleVerifyTotp();
                            }}
                            className={cn(
                                "flex h-9 w-32 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm tracking-widest shadow-sm transition-colors",
                                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                totpError && "border-destructive focus-visible:ring-destructive",
                            )}
                        />
                        {totpError && <p className="text-xs text-destructive">{totpError}</p>}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setStep("showing-qr")}
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Back
                        </button>
                        <button
                            onClick={() => void handleVerifyTotp()}
                            disabled={pending || totpCode.length !== 6}
                            className={cn(
                                "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                                "text-sm font-medium text-primary-foreground shadow transition-colors",
                                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            {pending ? "Verifying…" : "Verify"}
                        </button>
                    </div>
                </div>
            )}

            {/* ---- Backup codes display ----------------------------------- */}
            {step === "showing-backup-codes" && (
                <div className="space-y-3">
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                        <p className="text-sm font-medium text-amber-400">Save your backup codes</p>
                        <p className="mt-0.5 text-xs text-amber-400/80">
                            These codes can be used to access your account if you lose your authenticator. Each code can
                            only be used once. Store them somewhere safe.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-card px-4 py-3">
                        {backupCodes.map((code) => (
                            <code key={code} className="font-mono text-sm tracking-wider text-foreground">
                                {code}
                            </code>
                        ))}
                    </div>
                    <button
                        onClick={reset}
                        className={cn(
                            "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                            "text-sm font-medium text-primary-foreground shadow transition-colors",
                            "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        )}
                    >
                        Done
                    </button>
                </div>
            )}

            {/* ---- Enter password to REGENERATE backup codes --------------- */}
            {step === "entering-password-regenerate" && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Enter your current password to regenerate backup codes. Your existing backup codes will be
                        invalidated.
                    </p>
                    <div className="space-y-1.5">
                        <label htmlFor="2fa-regen-password" className="text-sm font-medium leading-none">
                            Current password
                        </label>
                        <input
                            id="2fa-regen-password"
                            type="password"
                            autoFocus
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleRegenerateBackupCodes();
                            }}
                            className={cn(
                                "flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                passwordError && "border-destructive focus-visible:ring-destructive",
                            )}
                        />
                        {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={reset}
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => void handleRegenerateBackupCodes()}
                            disabled={pending}
                            className={cn(
                                "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                                "text-sm font-medium text-primary-foreground shadow transition-colors",
                                "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            {pending ? "Regenerating…" : "Regenerate codes"}
                        </button>
                    </div>
                </div>
            )}

            {/* ---- Enter password to DISABLE ------------------------------- */}
            {step === "entering-password-disable" && (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        Enter your current password to disable two-factor authentication.
                    </p>
                    <div className="space-y-1.5">
                        <label htmlFor="2fa-disable-password" className="text-sm font-medium leading-none">
                            Current password
                        </label>
                        <input
                            id="2fa-disable-password"
                            type="password"
                            autoFocus
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleDisable();
                            }}
                            className={cn(
                                "flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                passwordError && "border-destructive focus-visible:ring-destructive",
                            )}
                        />
                        {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={reset}
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => void handleDisable()}
                            disabled={pending}
                            className={cn(
                                "inline-flex h-9 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2",
                                "text-sm font-medium text-destructive shadow-sm transition-colors",
                                "hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            {pending ? "Disabling…" : "Disable 2FA"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
