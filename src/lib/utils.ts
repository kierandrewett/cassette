import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

export const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
};

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export const formatCount = (n: number): string => COMPACT.format(n);

export const formatRelativeTime = (date: Date | string | number): string => {
    const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
    const diffMs = Date.now() - d.getTime();
    const sec = Math.round(diffMs / 1000);
    const min = Math.round(sec / 60);
    const hr = Math.round(min / 60);
    const day = Math.round(hr / 24);
    const week = Math.round(day / 7);
    const month = Math.round(day / 30);
    const year = Math.round(day / 365);
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    if (Math.abs(sec) < 60) return rtf.format(-sec, "second");
    if (Math.abs(min) < 60) return rtf.format(-min, "minute");
    if (Math.abs(hr) < 24) return rtf.format(-hr, "hour");
    if (Math.abs(day) < 7) return rtf.format(-day, "day");
    if (Math.abs(week) < 4) return rtf.format(-week, "week");
    if (Math.abs(month) < 12) return rtf.format(-month, "month");
    return rtf.format(-year, "year");
};
