import Image from "next/image";
import Link from "next/link";

import { SubscribeButton } from "@/components/social/SubscribeButton";
import { formatCount } from "@/lib/utils";

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

export const ChannelHeader = ({
    id,
    handle,
    name,
    description,
    avatarPath,
    bannerPath,
    subscriberCount,
    isOwner,
    isSubscribed = false,
}: ChannelHeaderProps) => {
    const avatarSrc = avatarPath ? `/api/channel/${id}/asset/avatar` : null;
    const bannerSrc = bannerPath ? `/api/channel/${id}/asset/banner` : null;

    return (
        <div>
            {/* Full-bleed banner */}
            <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-secondary to-secondary/40 sm:h-44 md:h-56">
                {bannerSrc && <Image src={bannerSrc} alt="" fill className="object-cover" sizes="100vw" priority />}
                {/* Gradient overlay at bottom for text legibility */}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/80 to-transparent" />
            </div>

            {/* Avatar + info row */}
            <div className="relative mx-auto max-w-5xl px-4 md:px-6">
                {/* Avatar overlapping banner edge */}
                <div className="-mt-8 flex items-end gap-4 sm:-mt-10">
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-4 border-background bg-secondary sm:h-24 sm:w-24">
                        {avatarSrc ? (
                            <Image src={avatarSrc} alt={name} fill className="object-cover" sizes="96px" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                                {name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 pb-1">
                        <div className="min-w-0">
                            <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">{name}</h1>
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

                        <div className="flex-shrink-0">
                            {isOwner ? (
                                <Link
                                    href={`/studio/c/${handle}/customise`}
                                    className="inline-flex h-9 items-center rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                                >
                                    Customise channel
                                </Link>
                            ) : (
                                <SubscribeButton channelId={id} initialSubscribed={isSubscribed} />
                            )}
                        </div>
                    </div>
                </div>

                {description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{description}</p>}
            </div>
        </div>
    );
};
