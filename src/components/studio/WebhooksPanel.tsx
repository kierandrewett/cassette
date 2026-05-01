"use client";

import { useState } from "react";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WebhooksPanelProps = {
    channelId: string;
};

type PlaintextReveal = {
    webhookId: string;
    secret: string;
};

// Allowed events mirroring the server-side constant.
const ALLOWED_EVENTS = ["transcode.completed", "transcode.failed", "comment.created"] as const;
type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

const EVENT_LABELS: Record<AllowedEvent, string> = {
    "transcode.completed": "Transcode completed",
    "transcode.failed": "Transcode failed",
    "comment.created": "Comment created",
};

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

type StatusPillProps = { status: string | null | undefined };

const StatusPill = ({ status }: StatusPillProps) => {
    if (!status) return <span className="text-xs text-muted-foreground">—</span>;

    const isSuccess = status === "success";
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                isSuccess ? "bg-green-500/10 text-green-400" : "bg-destructive/10 text-destructive",
            )}
        >
            {isSuccess ? "Success" : "Error"}
        </span>
    );
};

// ---------------------------------------------------------------------------
// One-time secret reveal banner
// ---------------------------------------------------------------------------

type SecretRevealProps = {
    label: string;
    secret: string;
    onDismiss: () => void;
};

const SecretReveal = ({ label, secret, onDismiss }: SecretRevealProps) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(secret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-5">
            <p className="text-sm font-medium text-yellow-400">{label} — you won&apos;t see this again.</p>
            <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-sm">
                    {secret}
                </code>
                <button
                    type="button"
                    onClick={() => void handleCopy()}
                    className={cn(
                        "inline-flex h-9 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors",
                        copied
                            ? "border-green-500/40 bg-green-500/10 text-green-400"
                            : "border-border bg-secondary text-foreground hover:bg-secondary/80",
                    )}
                >
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
            <button
                type="button"
                onClick={onDismiss}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
                I&apos;ve saved this secret
            </button>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Events checkbox group
// ---------------------------------------------------------------------------

type EventsCheckboxGroupProps = {
    value: string[];
    onChange: (evs: string[]) => void;
};

const EventsCheckboxGroup = ({ value, onChange }: EventsCheckboxGroupProps) => {
    const toggle = (ev: AllowedEvent) => {
        if (value.includes(ev)) {
            onChange(value.filter((e) => e !== ev));
        } else {
            onChange([...value, ev]);
        }
    };

    return (
        <div className="space-y-2">
            {ALLOWED_EVENTS.map((ev) => (
                <label key={ev} className="flex cursor-pointer select-none items-center gap-2">
                    <input
                        type="checkbox"
                        checked={value.includes(ev)}
                        onChange={() => toggle(ev)}
                        className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="text-sm">{EVENT_LABELS[ev]}</span>
                    <span className="font-mono text-xs text-muted-foreground">{ev}</span>
                </label>
            ))}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Deliveries drawer (dialog)
// ---------------------------------------------------------------------------

type DeliveriesDialogProps = {
    channelId: string;
    webhookId: string;
    webhookName: string;
    onClose: () => void;
};

const DeliveriesDialog = ({ channelId, webhookId, webhookName, onClose }: DeliveriesDialogProps) => {
    const { data, isLoading } = api.webhook.deliveries.useQuery({ channelId, webhookId, limit: 50 });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h3 className="text-base font-semibold">Deliveries — {webhookName}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
                <div className="max-h-[60vh] space-y-3 overflow-y-auto p-6">
                    {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                    {!isLoading && (!data || data.length === 0) && (
                        <p className="text-sm text-muted-foreground">No deliveries yet.</p>
                    )}
                    {data?.map((d) => (
                        <div key={d.id} className="space-y-1 rounded-lg border border-border bg-card px-4 py-3">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">{d.event}</span>
                                <StatusPill
                                    status={
                                        d.statusCode
                                            ? parseInt(d.statusCode, 10) >= 200 && parseInt(d.statusCode, 10) < 300
                                                ? "success"
                                                : "error"
                                            : d.errorMessage
                                              ? "error"
                                              : null
                                    }
                                />
                                {d.statusCode && (
                                    <span className="font-mono text-xs text-muted-foreground">HTTP {d.statusCode}</span>
                                )}
                                <span className="ml-auto text-xs text-muted-foreground">
                                    {d.createdAt ? formatRelativeTime(d.createdAt) : "—"}
                                </span>
                            </div>
                            {d.errorMessage && <p className="truncate text-xs text-destructive">{d.errorMessage}</p>}
                            {d.responseBody && (
                                <pre className="max-h-20 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-xs text-muted-foreground">
                                    {d.responseBody}
                                </pre>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Add / Edit webhook dialog
// ---------------------------------------------------------------------------

type WebhookFormDialogProps = {
    channelId: string;
    /** When editing, pass the existing webhook id + values. */
    editWebhookId?: string;
    defaultName?: string;
    defaultUrl?: string;
    defaultEvents?: string[];
    defaultEnabled?: boolean;
    onSuccess: (plaintextSecret?: string) => void;
    onClose: () => void;
};

const WebhookFormDialog = ({
    channelId,
    editWebhookId,
    defaultName = "",
    defaultUrl = "",
    defaultEvents = [],
    defaultEnabled,
    onSuccess,
    onClose,
}: WebhookFormDialogProps) => {
    const [name, setName] = useState(defaultName);
    const [url, setUrl] = useState(defaultUrl);
    const [events, setEvents] = useState<string[]>(defaultEvents);
    const [enabled, setEnabled] = useState(defaultEnabled ?? true);
    const [error, setError] = useState<string | null>(null);

    const createMut = api.webhook.create.useMutation({
        onSuccess: (res) => {
            onSuccess(res.plaintextSecret);
        },
        onError: (e) => setError(e.message),
    });

    const updateMut = api.webhook.update.useMutation({
        onSuccess: () => {
            onSuccess();
        },
        onError: (e) => setError(e.message),
    });

    const isPending = createMut.isPending || updateMut.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError("Name is required.");
            return;
        }
        if (!url.trim()) {
            setError("URL is required.");
            return;
        }
        if (events.length === 0) {
            setError("Select at least one event.");
            return;
        }

        if (editWebhookId) {
            updateMut.mutate({
                channelId,
                webhookId: editWebhookId,
                name: name.trim(),
                url: url.trim(),
                events,
                enabled,
            });
        } else {
            createMut.mutate({ channelId, name: name.trim(), url: url.trim(), events });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h3 className="text-base font-semibold">{editWebhookId ? "Edit webhook" : "Add webhook"}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 p-6">
                    <div className="space-y-1.5">
                        <label htmlFor="wh-name" className="text-sm font-medium">
                            Name
                        </label>
                        <input
                            id="wh-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. My CI hook"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="wh-url" className="text-sm font-medium">
                            URL
                        </label>
                        <input
                            id="wh-url"
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/webhook"
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Events</p>
                        <EventsCheckboxGroup value={events} onChange={setEvents} />
                    </div>

                    {editWebhookId && (
                        <div className="flex items-center gap-2">
                            <input
                                id="wh-enabled"
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                                className="h-4 w-4 rounded border-input accent-primary"
                            />
                            <label htmlFor="wh-enabled" className="cursor-pointer text-sm font-medium">
                                Enabled
                            </label>
                        </div>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-9 items-center rounded-md border border-border bg-secondary px-4 text-sm font-medium transition-colors hover:bg-secondary/80"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                        >
                            {isPending ? "Saving…" : editWebhookId ? "Save changes" : "Add webhook"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export const WebhooksPanel = ({ channelId }: WebhooksPanelProps) => {
    const { data: webhookList, refetch } = api.webhook.list.useQuery({ channelId });

    // Dialogs
    const [showAdd, setShowAdd] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [deliveriesId, setDeliveriesId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // One-time secret reveal
    const [secretReveal, setSecretReveal] = useState<PlaintextReveal | null>(null);
    const [secretRevealLabel, setSecretRevealLabel] = useState("Save your new webhook secret");

    // Mutations
    const toggleEnabledMut = api.webhook.update.useMutation({
        onSuccess: () => void refetch(),
    });

    const deleteMut = api.webhook.delete.useMutation({
        onSuccess: () => {
            setDeleteConfirmId(null);
            void refetch();
        },
    });

    const testFireMut = api.webhook.testFire.useMutation();

    const rotateSecretMut = api.webhook.rotateSecret.useMutation({
        onSuccess: (res, vars) => {
            setSecretRevealLabel("Save your new webhook secret");
            setSecretReveal({ webhookId: vars.webhookId, secret: res.plaintextSecret });
            void refetch();
        },
    });

    const editWebhook = editId ? webhookList?.find((w) => w.id === editId) : null;

    const handleAddSuccess = (plaintextSecret?: string) => {
        if (plaintextSecret) {
            setSecretRevealLabel("Save your new webhook secret");
            // We don't know the new webhook's id yet — use a placeholder key
            setSecretReveal({ webhookId: "new", secret: plaintextSecret });
        }
        setShowAdd(false);
        void refetch();
    };

    const handleEditSuccess = () => {
        setEditId(null);
        void refetch();
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Webhooks</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Receive HTTP POST notifications when events happen on your channel. Payloads are signed with
                        HMAC-SHA256.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                >
                    Add webhook
                </button>
            </div>

            {/* One-time secret reveal */}
            {secretReveal && (
                <SecretReveal
                    label={secretRevealLabel}
                    secret={secretReveal.secret}
                    onDismiss={() => setSecretReveal(null)}
                />
            )}

            {/* List */}
            <div className="space-y-3">
                {!webhookList || webhookList.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No webhooks yet.</p>
                ) : (
                    webhookList.map((wh) => {
                        // Redact URL host for display (keep scheme + host only).
                        let displayUrl = wh.url;
                        try {
                            const parsed = new URL(wh.url);
                            displayUrl =
                                parsed.origin + (parsed.pathname.length > 1 ? parsed.pathname.slice(0, 20) + "…" : "");
                        } catch {
                            // Leave as-is if URL parse fails.
                        }

                        return (
                            <div key={wh.id} className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
                                {/* Top row */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-semibold">{wh.name}</span>
                                            {!wh.enabled && (
                                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                    Disabled
                                                </span>
                                            )}
                                            <StatusPill status={wh.lastDeliveryStatus} />
                                        </div>
                                        <p className="truncate font-mono text-xs text-muted-foreground">{displayUrl}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Events:{" "}
                                            {wh.events.length > 0 ? (
                                                wh.events.join(", ")
                                            ) : (
                                                <span className="italic">none</span>
                                            )}
                                        </p>
                                        {wh.lastDeliveryAt && (
                                            <p className="text-xs text-muted-foreground">
                                                Last delivery {formatRelativeTime(wh.lastDeliveryAt)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Enabled toggle */}
                                    <button
                                        type="button"
                                        title={wh.enabled ? "Disable webhook" : "Enable webhook"}
                                        onClick={() =>
                                            toggleEnabledMut.mutate({
                                                channelId,
                                                webhookId: wh.id,
                                                enabled: !wh.enabled,
                                            })
                                        }
                                        className={cn(
                                            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                                            wh.enabled ? "bg-primary" : "bg-muted",
                                        )}
                                        aria-checked={wh.enabled}
                                        role="switch"
                                    >
                                        <span
                                            className={cn(
                                                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                                                wh.enabled ? "translate-x-4" : "translate-x-0.5",
                                            )}
                                        />
                                    </button>
                                </div>

                                {/* Action row */}
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setEditId(wh.id)}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        Edit
                                    </button>
                                    <span className="text-border">·</span>
                                    <button
                                        type="button"
                                        onClick={() => testFireMut.mutate({ channelId, webhookId: wh.id })}
                                        disabled={testFireMut.isPending}
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                                    >
                                        {testFireMut.isPending ? "Firing…" : "Test fire"}
                                    </button>
                                    <span className="text-border">·</span>
                                    <button
                                        type="button"
                                        onClick={() => rotateSecretMut.mutate({ channelId, webhookId: wh.id })}
                                        disabled={rotateSecretMut.isPending}
                                        className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                                    >
                                        Rotate secret
                                    </button>
                                    <span className="text-border">·</span>
                                    <button
                                        type="button"
                                        onClick={() => setDeliveriesId(wh.id)}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        View deliveries
                                    </button>
                                    <span className="text-border">·</span>
                                    {deleteConfirmId === wh.id ? (
                                        <span className="flex items-center gap-1">
                                            <span className="text-muted-foreground">Delete?</span>
                                            <button
                                                type="button"
                                                onClick={() => deleteMut.mutate({ channelId, webhookId: wh.id })}
                                                disabled={deleteMut.isPending}
                                                className="font-medium text-destructive hover:underline disabled:opacity-50"
                                            >
                                                {deleteMut.isPending ? "Deleting…" : "Yes, delete"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteConfirmId(null)}
                                                className="text-muted-foreground hover:underline"
                                            >
                                                Cancel
                                            </button>
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setDeleteConfirmId(wh.id)}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Add dialog */}
            {showAdd && (
                <WebhookFormDialog
                    channelId={channelId}
                    onSuccess={handleAddSuccess}
                    onClose={() => setShowAdd(false)}
                />
            )}

            {/* Edit dialog */}
            {editId && editWebhook && (
                <WebhookFormDialog
                    channelId={channelId}
                    editWebhookId={editId}
                    defaultName={editWebhook.name}
                    defaultUrl={editWebhook.url}
                    defaultEvents={editWebhook.events ?? []}
                    defaultEnabled={editWebhook.enabled}
                    onSuccess={handleEditSuccess}
                    onClose={() => setEditId(null)}
                />
            )}

            {/* Deliveries dialog */}
            {deliveriesId && (
                <DeliveriesDialog
                    channelId={channelId}
                    webhookId={deliveriesId}
                    webhookName={webhookList?.find((w) => w.id === deliveriesId)?.name ?? ""}
                    onClose={() => setDeliveriesId(null)}
                />
            )}
        </div>
    );
};
