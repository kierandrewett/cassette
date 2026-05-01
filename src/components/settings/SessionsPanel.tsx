"use client";

import { useState } from "react";

import { api } from "@/lib/trpc/client";

// ---------------------------------------------------------------------------
// User-agent parser — extracts a human-friendly "Browser on OS" label from
// a raw UA string without pulling in a heavy dependency.
// ---------------------------------------------------------------------------

const parseUserAgent = (ua: string | null): string => {
    if (!ua) return "Unknown device";

    // Browser detection — order matters (Edge before Chrome, etc.)
    let browser = "Unknown browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\/|Opera\//.test(ua)) browser = "Opera";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
    else if (/curl\//.test(ua)) browser = "curl";

    // OS detection
    let os = "Unknown OS";
    if (/Windows NT/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/iPhone/.test(ua)) os = "iPhone";
    else if (/iPad/.test(ua)) os = "iPad";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Linux/.test(ua)) os = "Linux";

    return `${browser} on ${os}`;
};

// ---------------------------------------------------------------------------
// Relative time helper — "2 minutes ago", "3 days ago", etc.
// Kept tiny to avoid importing a date library.
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

const expiresLabel = (date: Date): string => {
    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return "Expired";
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 1) return "Expires today";
    return `Expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SessionsPanel = () => {
    const utils = api.useUtils();
    const { data: sessions, isLoading, error } = api.account.listSessions.useQuery();
    const revokeSession = api.account.revokeSession.useMutation({
        onSuccess: () => utils.account.listSessions.invalidate(),
    });
    const revokeAllOther = api.account.revokeAllOtherSessions.useMutation({
        onSuccess: () => utils.account.listSessions.invalidate(),
    });

    const [revokeError, setRevokeError] = useState<string | null>(null);

    const handleRevoke = async (sessionId: string) => {
        setRevokeError(null);
        try {
            await revokeSession.mutateAsync({ sessionId });
        } catch (err) {
            setRevokeError(err instanceof Error ? err.message : "Failed to revoke session.");
        }
    };

    const handleRevokeAll = async () => {
        setRevokeError(null);
        try {
            await revokeAllOther.mutateAsync();
        } catch (err) {
            setRevokeError(err instanceof Error ? err.message : "Failed to revoke sessions.");
        }
    };

    const otherSessionCount = sessions?.filter((s) => !s.currentSession).length ?? 0;

    return (
        <div className="space-y-4">
            {/* Bulk action */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {isLoading
                        ? "Loading…"
                        : `${sessions?.length ?? 0} active session${(sessions?.length ?? 0) === 1 ? "" : "s"}`}
                </p>
                {otherSessionCount > 0 && (
                    <button
                        onClick={handleRevokeAll}
                        disabled={revokeAllOther.isPending}
                        className="text-xs font-medium text-destructive transition-colors hover:text-destructive/80 disabled:opacity-50"
                    >
                        {revokeAllOther.isPending ? "Revoking…" : "Revoke all other sessions"}
                    </button>
                )}
            </div>

            {/* Error banner */}
            {revokeError && (
                <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                    {revokeError}
                </p>
            )}

            {/* Session list */}
            {error && <p className="text-sm text-destructive">Failed to load sessions.</p>}

            {!isLoading && sessions && (
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                    {sessions.map((s) => (
                        <div key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
                            <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium text-foreground">
                                        {parseUserAgent(s.userAgent ?? null)}
                                    </span>
                                    {s.currentSession && (
                                        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                            This device
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {s.ipAddress ?? "IP unknown"} &middot; {relativeTime(new Date(s.createdAt))}{" "}
                                    &middot; {expiresLabel(new Date(s.expiresAt))}
                                </p>
                            </div>
                            <button
                                onClick={() => handleRevoke(s.id)}
                                disabled={s.currentSession || revokeSession.isPending}
                                className="shrink-0 text-xs font-medium text-destructive transition-colors hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                {revokeSession.isPending && revokeSession.variables?.sessionId === s.id
                                    ? "Revoking…"
                                    : "Revoke"}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
