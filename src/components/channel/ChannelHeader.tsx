"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CameraAdd02Icon, ImageAdd02Icon, PencilEdit02Icon } from "hugeicons-react";
import { Rss } from "lucide-react";
import { toast } from "sonner";

import { SubscribeButton } from "@/components/social/SubscribeButton";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
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
    /** Total public+ready videos on the channel — surfaced next to the
     *  subscriber count in the YouTube-style stats line. */
    videoCount?: number;
    /** Whether the current viewer is a member (owner/manager/uploader) of this channel. */
    isOwner: boolean;
    /** Whether the current viewer is subscribed. */
    isSubscribed?: boolean;
}

// YouTube-style channel header.
//
// Layout:
//   - Banner: full-bleed at top, rounded-xl, ~288px tall on desktop.
//   - Below banner: avatar (~160px) on the left, info column on the right.
//     Channel name (large), @handle · subscribers · videos line, description
//     with truncation, then the action row (Subscribe / RSS / Customise).
//   - Tabs are a sibling component rendered below this block.
//
// For owners, "Customise channel" flips the surface into an inline edit
// mode: avatar and banner each pick up a hover overlay that opens an
// upload dialog, name + description become editable. Save / Cancel
// replace the customise pill while editing.
export const ChannelHeader = ({
    id,
    handle,
    name: initialName,
    description: initialDescription,
    avatarPath,
    bannerPath,
    subscriberCount,
    videoCount,
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
    const [descExpanded, setDescExpanded] = useState(false);

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

    // YouTube collapses long descriptions to one line with "...more". We
    // approximate by clamping to two lines until the user clicks "...more".
    const isLong = description.length > 160 || description.includes("\n");
    const showFull = descExpanded || !isLong;

    return (
        <div className="mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8">
            {/* Banner — rounded card sitting in a side-padded container.
                Hidden entirely when no banner has been uploaded UNLESS the
                owner is in customise mode, where we render a placeholder
                tile that opens the upload dialog so they have somewhere to
                click. */}
            {bannerSrc ? (
                <div className="group/banner relative h-40 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-secondary to-secondary/40 sm:h-56 md:h-64 lg:h-72">
                    <Image src={bannerSrc} alt="" fill className="object-cover" sizes="100vw" priority />
                    {editing && (
                        <button
                            type="button"
                            onClick={() => setBannerOpen(true)}
                            className={cn(
                                "absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity",
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
            ) : editing ? (
                <button
                    type="button"
                    onClick={() => setBannerOpen(true)}
                    className="group/banner flex h-40 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground sm:h-56 md:h-64 lg:h-72"
                    aria-label="Upload channel banner"
                >
                    <ImageAdd02Icon size={20} strokeWidth={1.6} />
                    Upload channel banner
                </button>
            ) : null}

            {/* Header content row. Avatar and info live side-by-side from md+
                and stack on mobile. Avatar does not overlap the banner. */}
            <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-8">
                {/* Avatar */}
                <div className="relative flex-shrink-0 self-start">
                    <div className="relative h-28 w-28 overflow-hidden rounded-full md:h-40 md:w-40">
                        {/* SVG initials sit underneath; uploaded avatar overlays. */}
                        <InitialsAvatar name={name} seed={handle} size={160} className="h-full w-full" />
                        {avatarSrc && (
                            <Image src={avatarSrc} alt={name} fill className="object-cover" sizes="160px" />
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
                            <CameraAdd02Icon size={32} strokeWidth={1.6} />
                        </button>
                    )}
                </div>

                {/* Info column */}
                <div className="min-w-0 flex-1 space-y-3">
                    {/* Channel name */}
                    {editing ? (
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={100}
                            className="block w-full max-w-2xl rounded-md border border-border bg-background px-2 py-1 text-2xl font-bold tracking-tight focus:outline-none focus:ring-2 focus:ring-ring md:text-4xl"
                            placeholder="Channel name"
                        />
                    ) : (
                        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">{name}</h1>
                    )}

                    {/* Stats line: @handle · subscribers · videos */}
                    <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground/90">@{handle}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                            {formatCount(subscriberCount)} subscriber{subscriberCount !== 1 ? "s" : ""}
                        </span>
                        {videoCount !== undefined && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>
                                    {formatCount(videoCount)} video{videoCount !== 1 ? "s" : ""}
                                </span>
                            </>
                        )}
                    </p>

                    {/* Description with YouTube-style "...more" expansion */}
                    {editing ? (
                        <div>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                maxLength={2000}
                                rows={3}
                                className="block w-full max-w-2xl resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                placeholder="Tell viewers about your channel"
                            />
                            <p className="mt-1 max-w-2xl text-right text-xs text-muted-foreground">
                                {description.length} / 2000
                            </p>
                        </div>
                    ) : description ? (
                        <div className="max-w-2xl text-sm text-foreground/80">
                            <p className={cn(showFull ? "whitespace-pre-line" : "line-clamp-1")}>{description}</p>
                            {isLong && (
                                <button
                                    type="button"
                                    onClick={() => setDescExpanded((v) => !v)}
                                    className="mt-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                >
                                    {showFull ? "less" : "...more"}
                                </button>
                            )}
                        </div>
                    ) : null}

                    {/* Action row */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
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
                                <SubscribeButton channelId={id} initialSubscribed={isSubscribed} />
                                <button
                                    type="button"
                                    onClick={() => setRssOpen(true)}
                                    title="Subscribe via RSS"
                                    aria-label="Subscribe via RSS"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                                >
                                    <Rss size={16} strokeWidth={2} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
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
