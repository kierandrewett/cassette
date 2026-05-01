"use client";

import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PasskeyRecord {
    id: string;
    name: string | null;
    deviceType: string;
    createdAt: string | Date | null;
}

// ---------------------------------------------------------------------------
// Relative-time helper
// ---------------------------------------------------------------------------

const relativeTime = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return "just now";
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
};

// ---------------------------------------------------------------------------
// Passkey list hook — fetches via the Better-Auth passkey endpoint.
// ---------------------------------------------------------------------------

interface PasskeyListState {
    passkeys: PasskeyRecord[];
    isPending: boolean;
    error: string | null;
}

const usePasskeys = () => {
    const [state, setState] = useState<PasskeyListState>({ passkeys: [], isPending: true, error: null });

    const load = async () => {
        setState((prev) => ({ ...prev, isPending: true, error: null }));
        // Better-Auth exposes the atom via authClient.passkey.listPasskeys.
        // Calling it as a store: we use $fetch directly for simplicity.
        const result = await (
            authClient as unknown as {
                $fetch: (
                    path: string,
                    opts: { method: string },
                ) => Promise<{ data: PasskeyRecord[] | null; error: { message?: string } | null }>;
            }
        ).$fetch("/passkey/list-user-passkeys", { method: "GET" });

        if (result.error) {
            setState({ passkeys: [], isPending: false, error: result.error.message ?? "Failed to load passkeys." });
        } else {
            setState({ passkeys: result.data ?? [], isPending: false, error: null });
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { ...state, refetch: load };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PasskeysPanel = () => {
    const { passkeys, isPending, error, refetch } = usePasskeys();

    const [addOpen, setAddOpen] = useState(false);
    const [addName, setAddName] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [addPending, setAddPending] = useState(false);
    const [removeError, setRemoveError] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const handleAdd = async () => {
        if (!addName.trim()) {
            setAddError("Please enter a name for this passkey.");
            return;
        }
        setAddError(null);
        setAddPending(true);

        const result = await authClient.passkey.addPasskey({ name: addName.trim() });

        setAddPending(false);

        if (result?.error) {
            setAddError(result.error.message ?? "Failed to register passkey. Please try again.");
            return;
        }

        setAddOpen(false);
        setAddName("");
        await refetch();
    };

    const handleRemove = async (id: string) => {
        setRemoveError(null);
        setRemovingId(id);

        const result = await authClient.passkey.deletePasskey({ id });

        setRemovingId(null);

        if (result?.error) {
            setRemoveError(result.error.message ?? "Failed to remove passkey. Please try again.");
            return;
        }

        await refetch();
    };

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {isPending
                        ? "Loading…"
                        : `${passkeys.length} passkey${passkeys.length === 1 ? "" : "s"} registered`}
                </p>
                <button
                    onClick={() => {
                        setAddOpen(true);
                        setAddError(null);
                        setAddName("");
                    }}
                    className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                    Add a passkey
                </button>
            </div>

            {/* Error banners */}
            {error && (
                <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
            {removeError && (
                <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                    {removeError}
                </p>
            )}

            {/* Passkey list */}
            {!isPending && passkeys.length > 0 && (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {passkeys.map((pk) => (
                        <div key={pk.id} className="flex items-start justify-between gap-4 px-4 py-3">
                            <div className="min-w-0 space-y-0.5">
                                <span className="block truncate text-sm font-medium text-foreground">
                                    {pk.name ?? "Unnamed passkey"}
                                </span>
                                <p className="text-xs text-muted-foreground">
                                    {pk.deviceType ?? "Unknown device"}
                                    {pk.createdAt ? ` · Added ${relativeTime(new Date(pk.createdAt))}` : ""}
                                </p>
                            </div>
                            <button
                                onClick={() => void handleRemove(pk.id)}
                                disabled={removingId === pk.id}
                                className="shrink-0 text-xs font-medium text-destructive transition-colors hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                {removingId === pk.id ? "Removing…" : "Remove"}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {!isPending && passkeys.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No passkeys registered. Add one to sign in without a password.
                </p>
            )}

            {/* Add passkey dialog */}
            {addOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl">
                        <h3 className="text-base font-semibold text-foreground">Add a passkey</h3>
                        <p className="text-sm text-muted-foreground">
                            Give this passkey a name to identify the device or account it belongs to.
                        </p>

                        <div className="space-y-1.5">
                            <label htmlFor="passkey-name" className="text-sm font-medium leading-none">
                                Passkey name
                            </label>
                            <input
                                id="passkey-name"
                                type="text"
                                autoFocus
                                placeholder="e.g. MacBook Pro, iPhone"
                                value={addName}
                                onChange={(e) => setAddName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleAdd();
                                }}
                                className={cn(
                                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    addError && "border-destructive focus-visible:ring-destructive",
                                )}
                            />
                            {addError && <p className="text-xs text-destructive">{addError}</p>}
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setAddOpen(false);
                                    setAddName("");
                                    setAddError(null);
                                }}
                                disabled={addPending}
                                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleAdd()}
                                disabled={addPending}
                                className={cn(
                                    "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                                    "text-sm font-medium text-primary-foreground shadow transition-colors",
                                    "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                    "disabled:pointer-events-none disabled:opacity-50",
                                )}
                            >
                                {addPending ? "Registering…" : "Register passkey"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
