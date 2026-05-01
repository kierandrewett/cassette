"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home01Icon,
    Notification03Icon,
    LibraryIcon,
    Time04Icon,
    PlusSignIcon,
    DashboardSquare01Icon,
    Crown02Icon,
    UserMultipleIcon,
    PlaySquareIcon,
} from "hugeicons-react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

const PRIMARY_ITEMS: NavItem[] = [
    { href: "/", label: "Home", icon: Home01Icon },
    { href: "/subscriptions", label: "Subscriptions", icon: Notification03Icon, matchPrefix: true },
];

const LIBRARY_ITEMS: NavItem[] = [
    { href: "/library", label: "Library", icon: LibraryIcon, matchPrefix: true },
    { href: "/history", label: "History", icon: Time04Icon, matchPrefix: true },
    { href: "/playlist", label: "Playlists", icon: PlaySquareIcon, matchPrefix: true },
];

interface LeftRailProps {
    channels: UserChannel[];
    /** Whether the signed-in viewer holds an admin grant — controls the admin link. */
    isAdmin?: boolean;
    /** Whether the signed-in viewer is signed in at all. Drives Library/Studio visibility. */
    isAuthenticated?: boolean;
}

const isActive = (pathname: string, item: NavItem): boolean => {
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
}

// Single rail row. Icon column is fixed at 32 px, label flexes. Active state gets
// a subtle accent fill plus a 3 px accent left border. Hover bg is the standard
// `accent` token so it reads in both light and dark themes without hand-rolled
// rgba values.
const RailLink = ({ href, label, Icon, active, badge, avatar }: RailLinkProps) => {
    return (
        <Link
            href={href}
            className={cn(
                "group relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-3 text-sm font-medium transition-colors",
                "hover:bg-accent/60 hover:text-foreground",
                active ? "bg-accent text-accent-foreground" : "text-foreground/85",
            )}
            aria-current={active ? "page" : undefined}
        >
            {/* Active indicator — 3 px accent strip on the left, anchored within the row's rounded corners. */}
            <span
                aria-hidden="true"
                className={cn(
                    "absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-full transition-opacity",
                    active ? "bg-foreground opacity-90" : "bg-foreground opacity-0 group-hover:opacity-30",
                )}
            />
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                {avatar ? avatar : <Icon size={20} strokeWidth={active ? 2 : 1.6} />}
            </span>
            <span className="flex-1 truncate">{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className="rounded-full bg-foreground/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">
                    {badge > 99 ? "99+" : badge}
                </span>
            )}
        </Link>
    );
};

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <p className="mb-1 mt-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
        {children}
    </p>
);

const Divider = () => <div className="mx-3 my-3 h-px bg-border/60" aria-hidden="true" />;

export const LeftRail = ({ channels, isAdmin = false, isAuthenticated = false }: LeftRailProps) => {
    const pathname = usePathname();
    const ownsChannel = channels.length > 0;

    return (
        <aside
            className={cn(
                "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-background",
                // Header offset — 56px matches AppHeader height.
                "pt-14",
                "w-[var(--rail-width)]",
            )}
            aria-label="Primary navigation"
        >
            <ScrollArea className="flex-1 px-2 py-3">
                <nav>
                    <ul className="space-y-0.5">
                        {PRIMARY_ITEMS.map((item) => (
                            <li key={item.href}>
                                <RailLink
                                    href={item.href}
                                    label={item.label}
                                    Icon={item.icon}
                                    active={isActive(pathname, item)}
                                />
                            </li>
                        ))}
                    </ul>

                    {isAuthenticated && (
                        <>
                            <Divider />
                            <SectionHeader>You</SectionHeader>
                            <ul className="space-y-0.5">
                                {LIBRARY_ITEMS.map((item) => (
                                    <li key={item.href}>
                                        <RailLink
                                            href={item.href}
                                            label={item.label}
                                            Icon={item.icon}
                                            active={isActive(pathname, item)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    {/* Studio / admin shortcuts — only shown when relevant so signed-out
                        viewers and viewers without a channel don't see dead links. */}
                    {(ownsChannel || isAdmin) && (
                        <>
                            <Divider />
                            <SectionHeader>Manage</SectionHeader>
                            <ul className="space-y-0.5">
                                {ownsChannel && (
                                    <li>
                                        <RailLink
                                            href="/studio"
                                            label="Studio"
                                            Icon={DashboardSquare01Icon}
                                            active={pathname === "/studio" || pathname.startsWith("/studio/")}
                                        />
                                    </li>
                                )}
                                {isAdmin && (
                                    <li>
                                        <RailLink
                                            href="/admin"
                                            label="Admin"
                                            Icon={Crown02Icon}
                                            active={pathname === "/admin" || pathname.startsWith("/admin/")}
                                        />
                                    </li>
                                )}
                            </ul>
                        </>
                    )}

                    {/* User channels list — appears only when the viewer owns one or more
                        channels. Each row links to /c/<handle>. */}
                    {channels.length > 0 && (
                        <>
                            <Divider />
                            <SectionHeader>Your channels</SectionHeader>
                            <ul className="space-y-0.5">
                                {channels.map((channel) => {
                                    const href = `/c/${channel.handle}`;
                                    const active = pathname === href || pathname.startsWith(`${href}/`);
                                    const initials = channel.name.slice(0, 2).toUpperCase();
                                    return (
                                        <li key={channel.id}>
                                            <RailLink
                                                href={href}
                                                label={channel.name}
                                                Icon={UserMultipleIcon}
                                                active={active}
                                                avatar={
                                                    <Avatar className="h-7 w-7">
                                                        {channel.avatarPath && (
                                                            <AvatarImage
                                                                src={`/api/hls/${channel.avatarPath}`}
                                                                alt={channel.name}
                                                            />
                                                        )}
                                                        <AvatarFallback className="text-[10px]">
                                                            {initials}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                }
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}

                    {/* + Create channel — always shown to signed-in viewers under "Your
                        channels" so they can add another, or as the first/only channel
                        action when none exist yet. */}
                    {isAuthenticated && (
                        <ul className="mt-1 space-y-0.5">
                            <li>
                                <Link
                                    href="/account/channels"
                                    className={cn(
                                        "group flex items-center gap-3 rounded-lg py-2 pl-3 pr-3 text-sm font-medium",
                                        "text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                                    )}
                                >
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                                        <PlusSignIcon size={20} strokeWidth={1.6} />
                                    </span>
                                    <span className="flex-1 truncate">
                                        {channels.length > 0 ? "New channel" : "Create channel"}
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
