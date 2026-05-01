"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
    Menu01Icon,
    Search01Icon,
    Upload01Icon,
    Settings02Icon,
    DashboardSquare01Icon,
    Logout03Icon,
    UserCircleIcon,
    Crown02Icon,
    Sun03Icon,
    Moon02Icon,
    ComputerIcon,
    PaintBoardIcon,
} from "hugeicons-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { pushRecentSearch } from "@/lib/recent-searches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { CassetteWordmark } from "@/components/branding/CassetteWordmark";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";

export interface AppHeaderUser {
    name: string;
    email: string;
    image: string | null;
}

interface AppHeaderProps {
    user: AppHeaderUser | null;
    /** Whether the signed-in user is an admin. Controls the Admin link in the avatar dropdown. */
    isAdmin?: boolean;
    /** Callback to toggle the left rail collapsed state. */
    onMenuToggle?: () => void;
}

type ThemeChoice = "system" | "light" | "dark";
const THEME_STORAGE_KEY = "cassette.theme";

const applyThemeChoice = (choice: ThemeChoice): void => {
    const html = document.documentElement;
    if (choice === "dark") {
        html.classList.add("dark");
    } else if (choice === "light") {
        html.classList.remove("dark");
    } else {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        html.classList.toggle("dark", prefersDark);
    }
};

const readStoredTheme = (): ThemeChoice => {
    try {
        const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (raw === "dark" || raw === "light" || raw === "system") return raw;
    } catch {
        // ignore quota / private mode
    }
    return "system";
};

export const AppHeader = ({ user, isAdmin = false, onMenuToggle }: AppHeaderProps) => {
    const router = useRouter();
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Theme state — kept here (rather than in a hidden helper component) so
    // the radio group inside the dropdown can drive it directly. The pre-paint
    // script in app/layout.tsx already applies the persisted choice; this
    // hook only handles updates triggered from the dropdown.
    const [theme, setTheme] = useState<ThemeChoice>("system");
    useEffect(() => {
        setTheme(readStoredTheme());
    }, []);
    useEffect(() => {
        if (theme !== "system") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => applyThemeChoice("system");
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [theme]);

    const handleThemeSelect = (next: string) => {
        if (next !== "dark" && next !== "light" && next !== "system") return;
        setTheme(next);
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // ignore
        }
        applyThemeChoice(next);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = searchValue.trim();
        if (!trimmed) return;
        pushRecentSearch(trimmed);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
        setSearchOpen(false);
    };

    const handleSignOut = async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
    };

    const userInitials = user?.name
        ? user.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
        : "?";

    return (
        <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-sm">
            {/* Left: hamburger + wordmark */}
            <div className="flex shrink-0 items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onMenuToggle}
                    aria-label="Toggle sidebar"
                    className="rounded-lg text-muted-foreground hover:text-foreground"
                >
                    <Menu01Icon size={20} strokeWidth={1.6} />
                </Button>
                <Link href="/" className="ml-1">
                    <CassetteWordmark />
                </Link>
            </div>

            {/* Centre: search bar with autocomplete popover */}
            <div className="flex flex-1 justify-center px-4">
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                    <PopoverAnchor asChild>
                        <form
                            onSubmit={handleSearchSubmit}
                            className={cn(
                                "relative flex w-full max-w-xl items-center transition-all duration-200",
                                searchOpen ? "max-w-2xl" : "max-w-xl",
                            )}
                        >
                            <Search01Icon
                                size={16}
                                strokeWidth={1.6}
                                className="pointer-events-none absolute left-3 text-muted-foreground"
                            />
                            <Input
                                ref={inputRef}
                                type="search"
                                placeholder="Search"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                onFocus={() => setSearchOpen(true)}
                                className="rounded-full border-secondary bg-secondary/40 pl-9 pr-4 focus-visible:bg-background"
                                aria-label="Search cassette"
                            />
                        </form>
                    </PopoverAnchor>
                    <PopoverContent
                        align="center"
                        className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                        <SearchAutocomplete
                            query={searchValue}
                            onClose={() => setSearchOpen(false)}
                            onSelectRecent={(q) => setSearchValue(q)}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Right: create dropdown, notifications, avatar */}
            <div className="flex shrink-0 items-center gap-1">
                {/* Create dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Create"
                            className="rounded-lg text-muted-foreground hover:text-foreground"
                        >
                            <Upload01Icon size={20} strokeWidth={1.6} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Create</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/studio/upload" className="cursor-pointer">
                                <Upload01Icon size={16} strokeWidth={1.6} />
                                Upload video
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Notifications bell — disabled when signed out so we do not poll. */}
                <NotificationBell enabled={!!user} />

                {/* Account dropdown */}
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Account menu"
                                className="h-8 w-8 rounded-full p-0"
                            >
                                <Avatar className="h-8 w-8">
                                    {user.image && <AvatarImage src={user.image} alt={user.name} />}
                                    <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                                </Avatar>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel className="font-normal normal-case tracking-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none text-foreground">{user.name}</p>
                                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href="/account" className="cursor-pointer">
                                    <UserCircleIcon size={16} strokeWidth={1.6} />
                                    Your account
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/studio" className="cursor-pointer">
                                    <DashboardSquare01Icon size={16} strokeWidth={1.6} />
                                    Studio
                                </Link>
                            </DropdownMenuItem>
                            {isAdmin && (
                                <DropdownMenuItem asChild>
                                    <Link href="/admin" className="cursor-pointer">
                                        <Crown02Icon size={16} strokeWidth={1.6} />
                                        Admin
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />

                            {/* Theme submenu — radio items so the active choice
                                shows a dot. Selection persists via localStorage
                                and applies via applyThemeChoice. */}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <PaintBoardIcon size={16} strokeWidth={1.6} />
                                    Theme
                                    <span className="ml-auto text-xs capitalize text-muted-foreground">{theme}</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-44">
                                    <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeSelect}>
                                        <DropdownMenuRadioItem value="light">
                                            <span className="ml-6 flex items-center gap-2">
                                                <Sun03Icon size={16} strokeWidth={1.6} />
                                                Light
                                            </span>
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="dark">
                                            <span className="ml-6 flex items-center gap-2">
                                                <Moon02Icon size={16} strokeWidth={1.6} />
                                                Dark
                                            </span>
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="system">
                                            <span className="ml-6 flex items-center gap-2">
                                                <ComputerIcon size={16} strokeWidth={1.6} />
                                                System
                                            </span>
                                        </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuItem asChild>
                                <Link href="/settings" className="cursor-pointer">
                                    <Settings02Icon size={16} strokeWidth={1.6} />
                                    Settings
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onSelect={() => void handleSignOut()}
                            >
                                <Logout03Icon size={16} strokeWidth={1.6} />
                                Sign out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button variant="default" size="sm" asChild>
                        <Link href="/login">
                            <UserCircleIcon size={16} strokeWidth={1.6} />
                            Sign in
                        </Link>
                    </Button>
                )}
            </div>
        </header>
    );
};
