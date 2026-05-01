import Link from "next/link";
import Image from "next/image";

import { formatCount } from "@/lib/utils";

export interface SearchChannelResult {
    id: string;
    handle: string;
    name: string;
    description: string;
    avatarPath: string | null;
    subscriberCount: number;
    videoCount: number;
}

// Horizontal channel result card used in /search?tab=channels.
export const SearchChannelCard = ({ channel }: { channel: SearchChannelResult }) => {
    const avatarUrl = channel.avatarPath ? `/api/channel/${channel.id}/asset/avatar` : null;
    const initials = channel.name
        .split(" ")
        .map((s) => s[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <Link
            href={`/c/${channel.handle}`}
            className="flex items-center gap-4 rounded-2xl px-4 py-3 transition hover:bg-accent/40"
            aria-label={`Channel @${channel.handle}: ${channel.name}`}
        >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-secondary">
                {avatarUrl ? (
                    <Image src={avatarUrl} alt="" fill sizes="80px" unoptimized />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                        {initials}
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-base font-semibold text-foreground">{channel.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                    @{channel.handle} · {formatCount(channel.subscriberCount)} subscriber
                    {channel.subscriberCount === 1 ? "" : "s"} · {formatCount(channel.videoCount)} video
                    {channel.videoCount === 1 ? "" : "s"}
                </p>
                {channel.description ? (
                    <p className="line-clamp-2 max-w-xl text-sm text-muted-foreground/80">{channel.description}</p>
                ) : null}
            </div>
        </Link>
    );
};
