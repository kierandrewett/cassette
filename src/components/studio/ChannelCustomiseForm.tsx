"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { api } from "@/lib/trpc/client";
import { AssetUploader } from "./AssetUploader";

interface ChannelCustomiseFormProps {
    channelId: string;
    handle: string;
    initialName: string;
    initialDescription: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    /** Currently pinned video id (channel trailer) — null when no trailer set. */
    initialPinnedVideoId: string | null;
    /** Whether new comments on this channel are held for moderation. */
    initialModerateComments: boolean;
    /** Public+ready videos owned by this channel — pickable as a trailer. */
    eligibleTrailers: Array<{ id: string; title: string }>;
}

export const ChannelCustomiseForm = ({
    channelId,
    handle,
    initialName,
    initialDescription,
    avatarUrl,
    bannerUrl,
    initialPinnedVideoId,
    initialModerateComments,
    eligibleTrailers,
}: ChannelCustomiseFormProps) => {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [pinnedVideoId, setPinnedVideoId] = useState<string | null>(initialPinnedVideoId);
    const [moderateComments, setModerateComments] = useState<boolean>(initialModerateComments);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const utils = api.useUtils();

    const updateChannel = api.channel.update.useMutation({
        onSuccess: () => {
            setSaveSuccess(true);
            setSaveError(null);
            void utils.channel.byHandle.invalidate({ handle });
            // Refresh RSC so the header picks up the new name/description.
            startTransition(() => router.refresh());
        },
        onError: (err) => {
            setSaveError(err.message);
            setSaveSuccess(false);
        },
    });

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setSaveSuccess(false);
        setSaveError(null);
        updateChannel.mutate({
            channelId,
            name: name.trim(),
            description: description.trim(),
            pinnedVideoId: pinnedVideoId,
            moderateComments,
        });
    };

    const handleAssetUpdated = () => {
        // Invalidate the channel query so the header re-fetches the new path.
        void utils.channel.byHandle.invalidate({ handle });
        startTransition(() => router.refresh());
    };

    const isSaving = updateChannel.isPending || isPending;

    return (
        <div className="space-y-10">
            {/* --- Banner --- */}
            <section>
                <h2 className="mb-4 text-base font-semibold tracking-tight text-foreground">Channel banner</h2>
                <AssetUploader
                    kind="banner"
                    channelId={channelId}
                    currentUrl={bannerUrl}
                    onUpdated={handleAssetUpdated}
                />
            </section>

            {/* --- Avatar --- */}
            <section>
                <h2 className="mb-4 text-base font-semibold tracking-tight text-foreground">Channel avatar</h2>
                <AssetUploader
                    kind="avatar"
                    channelId={channelId}
                    currentUrl={avatarUrl}
                    onUpdated={handleAssetUpdated}
                />
            </section>

            {/* --- Name & description --- */}
            <section>
                <h2 className="mb-4 text-base font-semibold tracking-tight text-foreground">Channel details</h2>
                <form onSubmit={handleSave} className="max-w-xl space-y-5">
                    <div className="space-y-1.5">
                        <label htmlFor="channel-name" className="text-sm font-medium text-foreground">
                            Name
                        </label>
                        <input
                            id="channel-name"
                            type="text"
                            required
                            minLength={1}
                            maxLength={100}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isSaving}
                            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="channel-description" className="text-sm font-medium text-foreground">
                            Description
                        </label>
                        <textarea
                            id="channel-description"
                            rows={5}
                            maxLength={2000}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={isSaving}
                            className="block w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        />
                        <p className="text-right text-xs text-muted-foreground">{description.length} / 2000</p>
                    </div>

                    {/* Channel trailer */}
                    <div className="space-y-1.5">
                        <label htmlFor="channel-trailer" className="text-sm font-medium text-foreground">
                            Channel trailer
                        </label>
                        <select
                            id="channel-trailer"
                            value={pinnedVideoId ?? ""}
                            onChange={(e) => setPinnedVideoId(e.target.value || null)}
                            disabled={isSaving || eligibleTrailers.length === 0}
                            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        >
                            <option value="">None</option>
                            {eligibleTrailers.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.title}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Pinned to the top of the channel page as a hero card. Only public, ready videos can be
                            selected.
                        </p>
                    </div>

                    {/* Moderation toggle */}
                    <div className="space-y-1.5">
                        <label className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={moderateComments}
                                onChange={(e) => setModerateComments(e.target.checked)}
                                disabled={isSaving}
                                className="mt-1 accent-primary"
                            />
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium text-foreground">Moderate new comments</p>
                                <p className="text-xs text-muted-foreground">
                                    New comments from non-channel viewers are held in the moderation queue until
                                    approved. Find the queue at{" "}
                                    <a
                                        href={`/studio/c/${handle}/moderation`}
                                        className="underline-offset-4 hover:underline"
                                    >
                                        Studio &rarr; Moderation
                                    </a>
                                    .
                                </p>
                            </div>
                        </label>
                    </div>

                    {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                    {saveSuccess && (
                        <p className="text-sm text-green-600 dark:text-green-400">Changes saved successfully.</p>
                    )}

                    <div className="flex items-center gap-4">
                        <button
                            type="submit"
                            disabled={isSaving || name.trim().length === 0}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            {isSaving ? "Saving…" : "Save changes"}
                        </button>

                        <a
                            href={`/c/${handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                        >
                            Preview channel
                        </a>
                    </div>
                </form>
            </section>
        </div>
    );
};
