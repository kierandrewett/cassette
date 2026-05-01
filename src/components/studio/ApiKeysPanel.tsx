"use client";

import { useState } from "react";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";

type ApiKeysPanelProps = {
    channelId: string;
};

const generateSchema = z.object({
    name: z.string().min(1, "Key name is required.").max(80),
});

type GenerateValues = z.infer<typeof generateSchema>;

// Shown once after mint. Cleared when the user confirms they've saved it.
type NewlyMintedKey = {
    id: string;
    name: string;
    plaintext: string;
    keyPrefix: string;
};

export const ApiKeysPanel = ({ channelId }: ApiKeysPanelProps) => {
    const [newKey, setNewKey] = useState<NewlyMintedKey | null>(null);
    const [copied, setCopied] = useState(false);
    const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);

    const { data: keys, refetch } = api.channel.listApiKeys.useQuery({ channelId });

    const generateKey = api.channel.generateApiKey.useMutation({
        onSuccess: (minted) => {
            setNewKey({
                id: minted.id,
                name: minted.name,
                plaintext: minted.plaintext,
                keyPrefix: minted.keyPrefix,
            });
            void refetch();
            reset();
        },
    });

    const revokeKey = api.channel.revokeApiKey.useMutation({
        onSuccess: () => {
            setRevokeConfirmId(null);
            void refetch();
        },
    });

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<GenerateValues>({
        resolver: zodResolver(generateSchema),
    });

    const onGenerate = (values: GenerateValues) => {
        generateKey.mutate({ channelId, name: values.name });
    };

    const handleCopy = async () => {
        if (!newKey) return;
        await navigator.clipboard.writeText(newKey.plaintext);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaved = () => {
        setNewKey(null);
        setCopied(false);
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-lg font-semibold">API Keys</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    API keys grant upload access to this channel. Each key is shown in full exactly once — save it
                    somewhere safe.
                </p>
            </div>

            {/* One-time plaintext reveal */}
            {newKey && (
                <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-5 space-y-3">
                    <p className="text-sm font-medium text-yellow-400">
                        Save your new key — you won&apos;t see this again.
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 text-sm font-mono">
                            {newKey.plaintext}
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
                        onClick={handleSaved}
                        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                        I&apos;ve saved this key
                    </button>
                </div>
            )}

            {/* Generate form */}
            <form onSubmit={handleSubmit(onGenerate)} noValidate className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                    <label htmlFor="keyName" className="text-sm font-medium leading-none">
                        New key name
                    </label>
                    <input
                        id="keyName"
                        type="text"
                        placeholder="e.g. upload-script"
                        {...register("name")}
                        className={cn(
                            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            errors.name && "border-destructive focus-visible:ring-destructive",
                        )}
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <button
                    type="submit"
                    disabled={generateKey.isPending}
                    className={cn(
                        "inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4",
                        "text-sm font-medium text-primary-foreground shadow transition-colors",
                        "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    {generateKey.isPending ? "Generating…" : "Generate key"}
                </button>
            </form>

            {/* Key list */}
            <div className="space-y-2">
                {!keys || keys.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No active API keys yet.</p>
                ) : (
                    keys.map((key) => (
                        <div
                            key={key.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                        >
                            <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">{key.name}</span>
                                    {key.revokedAt && (
                                        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                            Revoked
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    <span className="font-mono">{key.keyPrefix}…</span>
                                    {" · "}
                                    {key.useCount} use{key.useCount !== 1 ? "s" : ""}
                                    {key.lastUsedAt && ` · last used ${formatRelativeTime(key.lastUsedAt)}`}
                                    {" · "}
                                    created {formatRelativeTime(key.createdAt)}
                                </div>
                            </div>

                            {!key.revokedAt && (
                                <div className="ml-4 shrink-0">
                                    {revokeConfirmId === key.id ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">Revoke this key?</span>
                                            <button
                                                type="button"
                                                onClick={() => revokeKey.mutate({ channelId, keyId: key.id })}
                                                disabled={revokeKey.isPending}
                                                className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                                            >
                                                {revokeKey.isPending ? "Revoking…" : "Yes, revoke"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRevokeConfirmId(null)}
                                                className="text-xs text-muted-foreground hover:underline"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setRevokeConfirmId(key.id)}
                                            className="text-xs text-muted-foreground hover:text-destructive"
                                        >
                                            Revoke
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
