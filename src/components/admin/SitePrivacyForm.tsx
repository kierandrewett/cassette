"use client";

import { useState } from "react";

import { api } from "@/lib/trpc/client";
import type { PrivacyMode } from "@/server/db/schema/site";

const MODES: { value: PrivacyMode; label: string; description: string }[] = [
    {
        value: "public",
        label: "Public",
        description:
            "Anonymous visitors can browse and watch public videos. Sign-up is open to everyone. This is the default behaviour.",
    },
    {
        value: "login-required",
        label: "Login required",
        description:
            "All pages require a signed-in account. Visitors who are not signed in are redirected to the login page. Sign-up remains open.",
    },
    {
        value: "login-only",
        label: "Login only (closed registration)",
        description:
            "Same as login required, but the registration page is disabled and the sign-up API returns 403. New accounts must be created by an admin via the Users panel.",
    },
];

export const SitePrivacyForm = () => {
    const { data, isLoading, refetch } = api.admin.siteConfig.get.useQuery();
    const setMode = api.admin.siteConfig.set.useMutation({
        onSuccess: () => void refetch(),
    });

    const [selected, setSelected] = useState<PrivacyMode | null>(null);

    const current: PrivacyMode = selected ?? data?.privacyMode ?? "public";

    const handleSave = () => {
        setMode.mutate({ privacyMode: current });
    };

    return (
        <div className="rounded-lg border border-border p-6 space-y-6 max-w-2xl">
            <div>
                <h2 className="text-lg font-semibold">Site privacy mode</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Controls who can access the site. Changes take effect within 30 seconds site-wide.
                </p>
            </div>

            {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading current setting…</p>
            ) : (
                <fieldset className="space-y-3" disabled={setMode.isPending}>
                    <legend className="sr-only">Privacy mode</legend>
                    {MODES.map((mode) => (
                        <label
                            key={mode.value}
                            className={[
                                "flex items-start gap-3 rounded-md border p-4 cursor-pointer transition-colors",
                                current === mode.value
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-muted-foreground/40",
                            ].join(" ")}
                        >
                            <input
                                type="radio"
                                name="privacy-mode"
                                value={mode.value}
                                checked={current === mode.value}
                                onChange={() => setSelected(mode.value)}
                                className="mt-0.5 accent-primary shrink-0"
                            />
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium leading-none">{mode.label}</p>
                                <p className="text-sm text-muted-foreground">{mode.description}</p>
                            </div>
                        </label>
                    ))}
                </fieldset>
            )}

            {setMode.isError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {setMode.error?.message ?? "Failed to save. Please try again."}
                </p>
            )}

            {setMode.isSuccess && (
                <p className="text-sm text-green-600 dark:text-green-400">Settings saved.</p>
            )}

            <button
                type="button"
                onClick={handleSave}
                disabled={isLoading || setMode.isPending || current === (data?.privacyMode ?? "public")}
                className={[
                    "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2",
                    "text-sm font-medium text-primary-foreground shadow transition-colors",
                    "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-50",
                ].join(" ")}
            >
                {setMode.isPending ? "Saving…" : "Save"}
            </button>
        </div>
    );
};
