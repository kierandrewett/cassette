"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
    DashboardSquare01Icon,
    Video01Icon,
    UploadCircle01Icon,
    Key01Icon,
    WebhookIcon,
    PaintBoardIcon,
    DatabaseIcon,
    SubtitleIcon,
    UserMultipleIcon,
    ArrowDown01Icon,
    Settings02Icon,
    ShieldUserIcon,
} from "hugeicons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Channel summary shape passed in from the layout (server-rendered).
export interface StudioChannel {
    id: string;
    handle: string;
    name: string;
    avatarPath: string | null;
}

type SubNavItem = {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    /** Match by exact pathname; otherwise startsWith. */
    exact?: boolean;
};

interface StudioSubNavProps {
    /** When set, renders the channel-scoped subnav (Overview, Videos, Upload, etc.). */
    channel?: StudioChannel;
    /** All channels owned by the viewer — used to populate the channel switcher popover. */
    channels: StudioChannel[];
}

// Channel-scoped sections. Customise/Webhooks/Quotas are owner+manager only,
// but we still render the link — the page itself enforces the role check.
const channelItems = (handle: string): SubNavItem[] => [
    { href: `/studio/channel/${handle}`, label: "Overview", icon: DashboardSquare01Icon, exact: true },
    { href: `/studio/channel/${handle}/videos`, label: "Videos", icon: Video01Icon },
    { href: `/studio/channel/${handle}/upload`, label: "Upload", icon: UploadCircle01Icon },
    { href: `/studio/channel/${handle}/api-keys`, label: "API Keys", icon: Key01Icon },
    { href: `/studio/channel/${handle}/webhooks`, label: "Webhooks", icon: WebhookIcon },
    { href: `/studio/channel/${handle}/customise`, label: "Customise", icon: PaintBoardIcon },
    { href: `/studio/channel/${handle}/moderation`, label: "Moderation", icon: ShieldUserIcon },
];

// Top-level /studio (multi-channel overview). Single tab so the surface still
// reads as a navigation row and not a stray pill.
const rootItems: SubNavItem[] = [{ href: "/studio", label: "Channels", icon: UserMultipleIcon, exact: true }];

const isActive = (pathname: string, item: SubNavItem): boolean => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

const initialsOf = (name: string): string => name.slice(0, 2).toUpperCase();

const avatarSrc = (channel: StudioChannel): string | null =>
    channel.avatarPath ? `/api/channel/${channel.id}/asset/avatar` : null;

interface ChannelChipProps {
    activeChannel?: StudioChannel;
    channels: StudioChannel[];
}

// Apple-TV-style segmented control of channels. The active chip shows the
// selected channel; clicking it opens a popover with the user's other
// channels and a "Manage all channels" link to /studio.
const ChannelChip = ({ activeChannel, channels }: ChannelChipProps) => {
    const [open, setOpen] = useState(false);

    const trigger = activeChannel ? (
        <button
            type="button"
            className={cn(
                // Channel chip — pill with avatar puck tucked into the left edge,
                // name text, and a discreet chevron suggesting it's a switcher.
                "group flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-sm font-medium shadow-sm",
                "transition-colors hover:border-foreground/20 hover:bg-accent",
                open && "border-foreground/20 bg-accent",
            )}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Switch channel — currently @${activeChannel.handle}`}
        >
            <Avatar className="h-7 w-7">
                {avatarSrc(activeChannel) && (
                    <AvatarImage src={avatarSrc(activeChannel) as string} alt={activeChannel.name} />
                )}
                <AvatarFallback className="text-[10px]">{initialsOf(activeChannel.name)}</AvatarFallback>
            </Avatar>
            <span className="max-w-[10rem] truncate">{activeChannel.name}</span>
            <ArrowDown01Icon
                size={14}
                strokeWidth={1.8}
                className="text-muted-foreground transition-transform group-hover:text-foreground group-aria-expanded:rotate-180"
            />
        </button>
    ) : (
        <button
            type="button"
            className={cn(
                "flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium shadow-sm",
                "transition-colors hover:border-foreground/20 hover:bg-accent",
                open && "border-foreground/20 bg-accent",
            )}
            aria-haspopup="menu"
            aria-expanded={open}
        >
            <UserMultipleIcon size={16} strokeWidth={1.8} />
            <span>All channels</span>
            <ArrowDown01Icon size={14} strokeWidth={1.8} className="text-muted-foreground" />
        </button>
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
                {channels.length > 0 ? (
                    <div className="flex flex-col">
                        <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Switch channel
                        </p>
                        {channels.map((channel) => {
                            const active = activeChannel?.id === channel.id;
                            return (
                                <Link
                                    key={channel.id}
                                    href={`/studio/channel/${channel.handle}`}
                                    onClick={() => setOpen(false)}
                                    className={cn(
                                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                                        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                                    )}
                                >
                                    <Avatar className="h-7 w-7">
                                        {avatarSrc(channel) && (
                                            <AvatarImage src={avatarSrc(channel) as string} alt={channel.name} />
                                        )}
                                        <AvatarFallback className="text-[10px]">
                                            {initialsOf(channel.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="min-w-0 flex-1 truncate font-medium">{channel.name}</span>
                                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                                        @{channel.handle}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <p className="px-2 py-3 text-sm text-muted-foreground">No other channels.</p>
                )}
                <div className="my-1 h-px bg-border" />
                <Link
                    href="/studio"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                    <Settings02Icon size={14} strokeWidth={1.6} />
                    Manage all channels
                </Link>
            </PopoverContent>
        </Popover>
    );
};

export const StudioSubNav = ({ channel, channels }: StudioSubNavProps) => {
    const pathname = usePathname();
    const items = channel ? channelItems(channel.handle) : rootItems;

    return (
        <div
            className={cn(
                // Sticks to the top of the AppShell content area on scroll. The
                // 56px (3.5rem) offset matches the AppHeader height so the pill
                // row never tucks behind the fixed header. The 1px border + a
                // soft backdrop-blur strip read as a deliberate divider between
                // the subnav and the page content.
                "sticky top-14 z-30 -mx-4 border-b border-border bg-background/95 px-4 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8",
            )}
        >
            <div className="flex items-center gap-3 overflow-x-auto py-3">
                <ChannelChip activeChannel={channel} channels={channels} />

                {/* Vertical divider between channel chip and section pills */}
                {items.length > 0 && <div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />}

                <nav className="flex min-w-0 items-center gap-1" aria-label="Studio sections">
                    {items.map(({ href, label, icon: Icon, exact }) => {
                        const active = isActive(pathname, { href, label, icon: Icon, exact });
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-current={active ? "page" : undefined}
                                title={label}
                                className={cn(
                                    // Pill tab — Apple-TV-ish segmented control. The selected
                                    // pill picks up a strong foreground fill so the active
                                    // section is unmistakable; idle pills sit in muted text
                                    // and lean on the hover state for affordance.
                                    "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors",
                                    active
                                        ? "bg-foreground text-background shadow-sm"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                )}
                            >
                                <Icon size={16} strokeWidth={active ? 2 : 1.7} />
                                <span>{label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
};

// Re-export the icon set so consumer pages don't have to know the mapping.
// Useful for empty-state CTAs that want to mirror the section icon.
export const StudioSectionIcons = {
    Overview: DashboardSquare01Icon,
    Videos: Video01Icon,
    Upload: UploadCircle01Icon,
    ApiKeys: Key01Icon,
    Webhooks: WebhookIcon,
    Customise: PaintBoardIcon,
    Quotas: DatabaseIcon,
    Captions: SubtitleIcon,
};
