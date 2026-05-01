"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Users, Video, HardDrive, Cog, Cpu } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { href: "/admin", label: "Overview", icon: BarChart3, exact: true },
    { href: "/admin/users", label: "Users", icon: Users, exact: false },
    { href: "/admin/videos", label: "Videos", icon: Video, exact: false },
    { href: "/admin/storage", label: "Storage", icon: HardDrive, exact: false },
    { href: "/admin/jobs", label: "Jobs", icon: Cpu, exact: false },
    { href: "/admin/settings", label: "Settings", icon: Cog, exact: false },
] as const;

export const AdminSubNav = () => {
    const pathname = usePathname();

    return (
        <nav className="flex gap-1 border-b border-border px-4 overflow-x-auto" aria-label="Admin navigation">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            "flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                            "border-b-2 -mb-px",
                            active
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
};
