"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Home09Icon,
    Tv01Icon,
    LibraryIcon,
    Clock01Icon,
    Playlist02Icon,
    PlusSignIcon,
    Settings02Icon,
    Crown02Icon,
} from "hugeicons-react";

import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface UserChannel {
    id: string;
    handle: string;
    name: string;
    avatarPath: string | null;
}

interface NavItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    /** Optional unread/badge count rendered to the right of the label. */
    badge?: number;
    /** Match active state with a startsWith check rather than strict equality. */
    matchPrefix?: boolean;
}

type NavItemDef = Omit<NavItem, "label"> & { labelKey: string };

const PRIMARY_ITEMS: NavItemDef[] = [
    { href: "/", labelKey: "home", icon: Home09Icon },
    { href: "/subscriptions", labelKey: "subscriptions", icon: Tv01Icon, matchPrefix: true },
];

const LIBRARY_ITEMS: NavItemDef[] = [
    { href: "/library", labelKey: "library", icon: LibraryIcon, matchPrefix: true },
    { href: "/history", labelKey: "history", icon: Clock01Icon, matchPrefix: true },
    { href: "/playlists", labelKey: "playlists", icon: Playlist02Icon, matchPrefix: true },
];

interface LeftRailProps {
    channels: UserChannel[];
    /** Channels the viewer subscribes to. Rendered as a "Subscriptions" list,
     *  same shape as the owned-channels list. */
    subscriptions?: UserChannel[];
    /** Whether the signed-in viewer holds an admin grant — controls the admin link. */
    isAdmin?: boolean;
    /** Whether the signed-in viewer is signed in at all. Drives Library/Studio visibility. */
    isAuthenticated?: boolean;
}

const isActive = (pathname: string, item: { href: string; matchPrefix?: boolean }): boolean => {
    if (item.matchPrefix) {
        if (item.href === "/") return pathname === "/";
        return pathname === item.href || pathname.startsWith(`${item.href}/`);
    }
    return pathname === item.href;
};

interface RailLinkProps {
    href: string;
    label: string;
    Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    active?: boolean;
    badge?: number;
    /** Optional avatar replaces the icon column (used for channel rows). */
    avatar?: React.ReactNode;
    /** Trailing content rendered to the right of the label. */
    trailing?: React.ReactNode;
}

// YouTube-style rail row. ~40px tall, rounded-lg, gap-3 between icon and
// label. Active state is a filled background only — no left accent stripe.
const RailLink = ({ href, label, Icon, active, badge, avatar, trailing }: RailLinkProps) => {
    return (
        <Link
            href={href}
            className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                    ? "bg-secondary font-medium text-foreground"
                    : "font-normal text-foreground/85 hover:bg-secondary/60 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
        >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                {avatar ? avatar : <Icon size={22} strokeWidth={active ? 2 : 1.6} />}
            </span>
            <span className="flex-1 truncate">{label}</span>
            {trailing}
            {badge !== undefined && badge > 0 && (
                <span className="rounded-full bg-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">
                    {badge > 99 ? "99+" : badge}
                </span>
            )}
        </Link>
    );
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <p className="mb-1 mt-2 px-3 text-base font-semibold tracking-tight text-foreground">{children}</p>
);

const Divider = () => <div className="mx-3 my-2 h-px bg-border/50" aria-hidden="true" />;

// Channel avatar inside a rail row. Used for both Your channels and
// Subscriptions sections. The InitialsAvatar SVG is the fallback; an
// uploaded avatar overlays it via plain <img>.
const ChannelAvatar = ({ channel }: { channel: UserChannel }) => {
    return (
        <span className="relative inline-block h-6 w-6 overflow-hidden rounded-full">
            <InitialsAvatar name={channel.name} seed={channel.handle} size={24} />
            {channel.avatarPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`/api/channel/${channel.id}/asset/avatar`}
                    alt={channel.name}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            )}
        </span>
    );
};

export const LeftRail = ({
    channels,
    subscriptions = [],
    isAdmin = false,
    isAuthenticated = false,
}: LeftRailProps) => {
    const pathname = usePathname();
    const t = useTranslations("nav");

    return (
        <aside
            className={cn(
                // top-14 puts the rail flush below the AppHeader; no padding
                // hack on the inner content. left-0 + bottom-0 anchor the rest.
                "fixed bottom-0 left-0 top-14 z-40 flex flex-col bg-background",
                "w-[var(--rail-width)]",
            )}
            aria-label="Primary navigation"
        >
            <ScrollArea className="flex-1 px-2 pb-3">
                <nav>
                    <ul className="space-y-0.5">
                        {PRIMARY_ITEMS.map((item) => (
                            <li key={item.href}>
                                <RailLink
                                    href={item.href}
                                    label={t(item.labelKey)}
                                    Icon={item.icon}
                                    active={isActive(pathname, item)}
                                />
                            </li>
                        ))}
                    </ul>

                    {isAuthenticated && (
                        <>
                            <Divider />
                            <SectionHeader>{t("you")}</SectionHeader>
                            <ul className="space-y-0.5">
                                {LIBRARY_ITEMS.map((item) => (
                                    <li key={item.href}>
                                        <RailLink
                                            href={item.href}
                                            label={t(item.labelKey)}
                                            Icon={item.icon}
                                            active={isActive(pathname, item)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {/* Owned channels — each row links to /@<handle>; a
                        small Studio shortcut sits to the right so the user
                        does not need a top-level Studio entry to manage one.
                        The Studio button is rendered as a SIBLING of the
                        Link rather than nested inside it: nesting an <a>
                        inside an <a> emits invalid HTML and Next/Link
                        intercepts the click before our onClick can fire,
                        which is why the previous implementation didn't
                        actually navigate. Absolute positioning keeps it
                        flush to the right of the row regardless of label
                        length. */}
                    {channels.length > 0 && (
                        <TooltipProvider delayDuration={150}>
                            <Divider />
                            <SectionHeader>{t("yourChannels")}</SectionHeader>
                            <ul className="space-y-0.5">
                                {channels.map((channel) => {
                                    const href = `/@${channel.handle}`;
                                    const studioHref = `/studio/channel/${channel.handle}`;
                                    const active = pathname === href || pathname.startsWith(`${href}/`);
                                    return (
                                        <li key={channel.id} className="group relative">
                                            <Link
                                                href={href}
                                                aria-current={active ? "page" : undefined}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-lg px-3 py-2 pr-10 text-sm transition-colors",
                                                    active
                                                        ? "bg-secondary font-medium text-foreground"
                                                        : "font-normal text-foreground/85 hover:bg-secondary/60 hover:text-foreground",
                                                )}
                                            >
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                                                    <ChannelAvatar channel={channel} />
                                                </span>
                                                <span className="flex-1 truncate">{channel.name}</span>
                                            </Link>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Link
                                                        href={studioHref}
                                                        aria-label={`Open ${channel.name} in Studio`}
                                                        className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                                                    >
                                                        <Settings02Icon size={15} strokeWidth={1.8} />
                                                    </Link>
                                                </TooltipTrigger>
                                                <TooltipContent side="right">Open in Studio</TooltipContent>
                                            </Tooltip>
                                        </li>
                                    );
                                })}
                            </ul>
                        </TooltipProvider>
                    )}

                    {/* Subscriptions — channels the viewer follows, listed
                        like Your channels for direct access. */}
                    {subscriptions.length > 0 && (
                        <>
                            <Divider />
                            <SectionHeader>{t("subscriptions")}</SectionHeader>
                            <ul className="space-y-0.5">
                                {subscriptions.map((channel) => {
                                    const href = `/channel/${channel.handle}`;
                                    const active = pathname === href || pathname.startsWith(`${href}/`);
                                    return (
                                        <li key={channel.id}>
                                            <RailLink
                                                href={href}
                                                label={channel.name}
                                                Icon={Tv01Icon}
                                                active={active}
                                                avatar={<ChannelAvatar channel={channel} />}
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}

                    {/* Admin shortcut — only visible when the viewer holds an
                        admin grant. Studio no longer has a top-level entry
                        because the per-channel chip above covers it. */}
                    {isAdmin && (
                        <>
                            <Divider />
                            <ul className="space-y-0.5">
                                <li>
                                    <RailLink
                                        href="/admin"
                                        label={t("admin")}
                                        Icon={Crown02Icon}
                                        active={pathname === "/admin" || pathname.startsWith("/admin/")}
                                    />
                                </li>
                            </ul>
                        </>
                    )}

                    {/* + Create channel — always shown to signed-in viewers
                        under the channel/subscription sections. */}
                    {isAuthenticated && (
                        <ul className="mt-1 space-y-0.5">
                            <li>
                                <Link
                                    href="/account/channels"
                                    className={cn(
                                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                                        "text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground",
                                    )}
                                >
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                                        <PlusSignIcon size={22} strokeWidth={1.6} />
                                    </span>
                                    <span className="flex-1 truncate">
                                        {channels.length > 0 ? t("newChannel") : t("createChannel")}
                                    </span>
                                </Link>
                            </li>
                        </ul>
                    )}
                </nav>
            </ScrollArea>
        </aside>
    );
};
