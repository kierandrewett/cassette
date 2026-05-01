"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookMarked, Library, History, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
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
    icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
    { href: "/", label: "Home", icon: <Home className="h-5 w-5" /> },
    { href: "/subscriptions", label: "Subscriptions", icon: <BookMarked className="h-5 w-5" /> },
    { href: "/library", label: "Library", icon: <Library className="h-5 w-5" /> },
    { href: "/history", label: "History", icon: <History className="h-5 w-5" /> },
];

interface LeftRailProps {
    channels: UserChannel[];
    /** Controlled from AppShell — allows server to pass initial state. */
    defaultCollapsed?: boolean;
}

export const LeftRail = ({ channels, defaultCollapsed = false }: LeftRailProps) => {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    return (
        <aside
            className={cn(
                "fixed inset-y-0 left-0 z-40 flex flex-col bg-background border-r border-border transition-[width] duration-200 ease-in-out",
                // Header offset — 56px matches AppHeader height.
                "pt-14",
                collapsed ? "w-[var(--rail-collapsed-width)]" : "w-[var(--rail-width)]",
            )}
        >
            <ScrollArea className="flex-1 px-2 py-3">
                <nav aria-label="Main navigation">
                    <ul className="space-y-0.5">
                        {NAV_ITEMS.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <li key={item.href}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Link
                                                href={item.href}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                                    "hover:bg-accent hover:text-accent-foreground",
                                                    active && "bg-accent text-accent-foreground",
                                                    collapsed && "justify-center px-2",
                                                )}
                                                aria-current={active ? "page" : undefined}
                                            >
                                                {item.icon}
                                                {!collapsed && <span>{item.label}</span>}
                                            </Link>
                                        </TooltipTrigger>
                                        {collapsed && (
                                            <TooltipContent side="right">{item.label}</TooltipContent>
                                        )}
                                    </Tooltip>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* "You" section — user channels */}
                {channels.length > 0 && (
                    <div className="mt-4">
                        {!collapsed && (
                            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                You
                            </p>
                        )}
                        <ul className="space-y-0.5">
                            {channels.map((channel) => {
                                const href = `/c/${channel.handle}`;
                                const active = pathname.startsWith(href);
                                const initials = channel.name.slice(0, 2).toUpperCase();
                                return (
                                    <li key={channel.id}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Link
                                                    href={href}
                                                    className={cn(
                                                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                                        "hover:bg-accent hover:text-accent-foreground",
                                                        active && "bg-accent text-accent-foreground",
                                                        collapsed && "justify-center px-2",
                                                    )}
                                                    aria-current={active ? "page" : undefined}
                                                >
                                                    <Avatar className="h-6 w-6 shrink-0">
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
                                                    {!collapsed && (
                                                        <span className="truncate">{channel.name}</span>
                                                    )}
                                                </Link>
                                            </TooltipTrigger>
                                            {collapsed && (
                                                <TooltipContent side="right">{channel.name}</TooltipContent>
                                            )}
                                        </Tooltip>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {/* Create channel CTA */}
                <div className={cn("mt-4 px-2", collapsed && "flex justify-center px-0")}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size={collapsed ? "icon" : "sm"}
                                asChild
                                className={cn(
                                    "w-full justify-start gap-3 rounded-lg text-muted-foreground hover:text-foreground",
                                    collapsed && "w-9 justify-center",
                                )}
                            >
                                <Link href="/studio">
                                    <Plus className="h-4 w-4 shrink-0" />
                                    {!collapsed && <span>Create channel</span>}
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        {collapsed && <TooltipContent side="right">Create channel</TooltipContent>}
                    </Tooltip>
                </div>
            </ScrollArea>

            {/* Collapse toggle — pinned to the bottom of the rail */}
            <div className={cn("border-t border-border p-2", collapsed && "flex justify-center")}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCollapsed((c) => !c)}
                            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                            className="rounded-lg text-muted-foreground hover:text-foreground"
                        >
                            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        {collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    </TooltipContent>
                </Tooltip>
            </div>
        </aside>
    );
};
