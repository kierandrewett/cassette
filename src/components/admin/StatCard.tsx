import Link from "next/link";
import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatCardProps {
    label: string;
    value: string | number;
    sub?: string;
    icon?: LucideIcon;
    href?: string;
    className?: string;
}

export const StatCard = ({ label, value, sub, icon: Icon, href, className }: StatCardProps) => {
    const content = (
        <div
            className={cn(
                "rounded-lg border border-border bg-card p-4 flex flex-col gap-2",
                href && "hover:border-primary/50 transition-colors cursor-pointer",
                className,
            )}
        >
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
    );

    if (href) {
        return <Link href={href}>{content}</Link>;
    }
    return content;
};
