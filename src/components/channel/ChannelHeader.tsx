"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CameraAdd02Icon, ImageAdd02Icon, PencilEdit02Icon, RssIcon } from "hugeicons-react";
import { toast } from "sonner";

import { SubscribeButton } from "@/components/social/SubscribeButton";
import { AssetUploader } from "@/components/studio/AssetUploader";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/trpc/client";
import { cn, formatCount } from "@/lib/utils";

interface ChannelHeaderProps {
    id: string;
    handle: string;
    name: string;
    description: string;
    avatarPath: string | null;
    bannerPath: string | null;
    subscriberCount: number;
    /** Whether the current viewer is a member (owner/manager/uploader) of this channel. */
    isOwner: boolean;
    /** Whether the current viewer is subscribed. */
    isSubscribed?: boolean;
}

// Old-YouTube-style channel header.
//
// For owners, clicking "Customise channel" flips the surface into an inline
// edit mode: the avatar and banner each pick up a hover overlay that opens
// an upload dialog, and the name + description become directly editable
// fields. Save / Cancel replace the customise pill while editing. Settings
// that don't fit the inline model (channel trailer, comment moderation)
// still live at /studio/channel/<handle>/customise.
export const ChannelHeader = ({
    id,
    handle,
    name: initialName,
    description: initialDescription,
    avatarPath,
    bannerPath,
    subscriberCount,
    isOwner,
    isSubscribed = false,
}: ChannelHeaderProps) => {
    const router = useRouter();
    const utils = api.useUtils();
    const [, startTransition] = useTransition();

    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);
    const [avatarOpen, setAvatarOpen] = useState(false);
    const [bannerOpen, setBannerOpen] = useState(false);
    const [rssOpen, setRssOpen] = useState(false);

    // Absolute feed URL — rendered into the dialog so the user can copy it
    // straight into a feed reader. We compute on the client so it's correct
    // for whichever host they're on (localhost, prod, custom domain).
    const feedPath = `/channel/${handle}/feed.xml`;
    const feedUrl = typeof window !== "undefined" ? `${window.location.origin}${feedPath}` : feedPath;

    const avatarSrc = avatarPath ? `/api/channel/${id}/asset/avatar` : null;
    const bannerSrc = bannerPath ? `/api/channel/${id}/asset/banner` : null;

    const updateChannel = api.channel.update.useMutation({
        onSuccess: () => {
            toast.success("Channel updated");
            void utils.channel.byHandle.invalidate({ handle });
            startTransition(() => router.refresh());
            setEditing(false);
        },
        onError: (err) => toast.error(err.message),
    });

    const dirty = name.trim() !== initialName || description.trim() !== initialDescription;

    const handleSave = () => {
        if (!dirty) {
            setEditing(false);
            return;
        }
        updateChannel.mutate({
            channelId: id,
            name: name.trim(),
            description: description.trim(),
        });
    };

    const handleCancel = () => {
        setName(initialName);
        setDescription(initialDescription);
        setEditing(false);
    };

    const handleAssetUpdated = () => {
        void utils.channel.byHandle.invalidate({ handle });
        startTransition(() => router.refresh());
    };

    return (
        <div>
            {/* Full-bleed banner */}
            <div className="group/banner relative h-32 w-full overflow-hidden bg-gradient-to-br from-secondary to-secondary/40 sm:h-44 md:h-56">
                {bannerSrc && <Image src={bannerSrc} alt="" fill className="object-cover" sizes="100vw" priority />}
                {/* Gradient overlay at bottom for text legibility */}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/80 to-transparent" />

                {editing && (
                    <button
                        type="button"
                        onClick={() => setBannerOpen(true)}
                        className={cn(
                            "absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity",
                            "hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none",
                        )}
                        aria-label="Change banner"
                    >
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/60 px-4 py-2 text-sm font-medium">
                            <ImageAdd02Icon size={18} strokeWidth={1.6} />
                            Change banner
                        </span>
                    </button>
                )}
            </div>

            {/* Avatar + info row */}
            <div className="relative mx-auto max-w-5xl px-4 md:px-6">
                {/* Avatar overlapping banner edge */}
                <div className="-mt-8 flex items-end gap-4 sm:-mt-10">
                    <div className="relative h-20 w-20 flex-shrink-0 sm:h-24 sm:w-24">
                        <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-background bg-secondary">
                            {avatarSrc ? (
                                <Image src={avatarSrc} alt={name} fill className="object-cover" sizes="96px" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                                    {name.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        {editing && (
                            <button
                                type="button"
                                onClick={() => setAvatarOpen(true)}
                                className={cn(
                                    "absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity",
                                    "hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                                )}
                                aria-label="Change avatar"
                            >
                                <CameraAdd02Icon size={22} strokeWidth={1.6} />
                            </button>
                        )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 pb-1">
                        <div className="min-w-0">
                            {editing ? (
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    maxLength={100}
                                    className="w-full max-w-md rounded-md border border-border bg-background px-2 py-1 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-ring sm:text-2xl"
                                    placeholder="Channel name"
                                />
                            ) : (
                                <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">{name}</h1>
                            )}
                            <p className="text-sm text-muted-foreground">
                                <span>@{handle}</span>
                                <span aria-hidden="true" className="mx-1">
                                    &middot;
                                </span>
                                <span>
                                    {formatCount(subscriberCount)} subscriber{subscriberCount !== 1 ? "s" : ""}
                                </span>
                            </p>
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-2">
                            {isOwner ? (
                                editing ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleCancel}
                                            disabled={updateChannel.isPending}
                                            className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSave}
                                            disabled={updateChannel.isPending || name.trim().length === 0}
                                            className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            {updateChannel.isPending ? "Saving…" : "Save"}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setEditing(true)}
                                        className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                                    >
                                        <PencilEdit02Icon size={16} strokeWidth={1.6} />
                                        Customise channel
                                    </button>
                                )
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setRssOpen(true)}
                                        title="Subscribe via RSS"
                                        aria-label="Subscribe via RSS"
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                                    >
                                        <RssIcon size={16} strokeWidth={1.8} />
                                    </button>
                                    <SubscribeButton channelId={id} initialSubscribed={isSubscribed} />
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {editing ? (
                    <div className="mt-3">
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={2000}
                            rows={3}
                            className="block w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="Tell viewers about your channel"
                        />
                        <p className="mt-1 text-right text-xs text-muted-foreground">{description.length} / 2000</p>
                    </div>
                ) : description ? (
                    <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{description}</p>
                ) : null}
            </div>

            {/* Asset upload dialogs — opened from the inline edit overlays. */}
            <Dialog open={avatarOpen} onOpenChange={setAvatarOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Channel avatar</DialogTitle>
                    </DialogHeader>
                    <AssetUploader
                        kind="avatar"
                        channelId={id}
                        currentUrl={avatarSrc}
                        onUpdated={() => {
                            handleAssetUpdated();
                            setAvatarOpen(false);
                        }}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={bannerOpen} onOpenChange={setBannerOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Channel banner</DialogTitle>
                    </DialogHeader>
                    <AssetUploader
                        kind="banner"
                        channelId={id}
                        currentUrl={bannerSrc}
                        onUpdated={() => {
                            handleAssetUpdated();
                            setBannerOpen(false);
                        }}
                    />
                </DialogContent>
            </Dialog>

            {/* RSS subscribe dialog — surfaces the feed URL so the user can
                paste it into a feed reader. Includes a Copy button + a
                direct link to the raw feed for inline preview. */}
            <Dialog open={rssOpen} onOpenChange={setRssOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Subscribe via RSS</DialogTitle>
                        <DialogDescription>
                            Paste the URL below into your feed reader to follow @{handle} without an account.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            readOnly
                            value={feedUrl}
                            className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            onFocus={(e) => e.currentTarget.select()}
                        />
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(feedUrl);
                                    toast.success("Feed URL copied");
                                } catch {
                                    toast.error("Could not copy — select and copy manually.");
                                }
                            }}
                            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            Copy
                        </button>
                    </div>
                    <a
                        href={feedPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                        Open feed in browser →
                    </a>
                </DialogContent>
            </Dialog>
        </div>
    );
};
