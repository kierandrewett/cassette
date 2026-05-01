"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home01Icon, Notification03Icon, LibraryIcon, Time04Icon } from "hugeicons-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { href: "/", label: "Home", Icon: Home01Icon },
    { href: "/subscriptions", label: "Subs", Icon: Notification03Icon },
    { href: "/library", label: "Library", Icon: LibraryIcon },
    { href: "/history", label: "History", Icon: Time04Icon },
] as const;

// Bottom-tab navigation shown only on narrow (< md) viewports.
// The left rail is hidden at that breakpoint and this replaces it.
export const MobileNav = () => {
    const pathname = usePathname();

    return (
        <nav
            className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-background/90 backdrop-blur-sm md:hidden"
            aria-label="Mobile navigation"
        >
            {NAV_ITEMS.map(({ href, label, Icon }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
                return (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
                            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                    >
                        <Icon size={20} strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
                        <span>{label}</span>
                    </Link>
                );
            })}
        </nav>
    );
};
