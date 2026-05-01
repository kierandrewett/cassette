"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Menu, Search, Upload, Bell, Settings, Clapperboard, LogOut, User } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { CassetteWordmark } from "@/components/branding/CassetteWordmark";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";

export interface AppHeaderUser {
    name: string;
    email: string;
    image: string | null;
}

interface AppHeaderProps {
    user: AppHeaderUser | null;
    /** Callback to toggle the left rail collapsed state. */
    onMenuToggle?: () => void;
}

export const AppHeader = ({ user, onMenuToggle }: AppHeaderProps) => {
    const router = useRouter();
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchValue.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`);
            setSearchOpen(false);
        }
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
                    <Menu className="h-5 w-5" />
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
                            <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                ref={inputRef}
                                type="search"
                                placeholder="Search"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                onFocus={() => setSearchOpen(true)}
                                className="rounded-full pl-9 pr-4 bg-secondary/40 border-secondary focus-visible:bg-background"
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
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Right: create dropdown, notifications, avatar */}
            <div className="flex shrink-0 items-center gap-1">
                {/* Create dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Create" className="rounded-lg text-muted-foreground hover:text-foreground">
                            <Upload className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Create</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/studio/upload" className="cursor-pointer">
                                <Upload className="h-4 w-4" />
                                Upload video
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Notifications bell (placeholder) */}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Notifications"
                    className="rounded-lg text-muted-foreground hover:text-foreground"
                >
                    <Bell className="h-5 w-5" />
                </Button>

                {/* Account dropdown */}
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Account menu"
                                className="rounded-full p-0 h-8 w-8"
                            >
                                <Avatar className="h-8 w-8">
                                    {user.image && <AvatarImage src={user.image} alt={user.name} />}
                                    <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                                </Avatar>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{user.name}</p>
                                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href="/studio" className="cursor-pointer">
                                    <Clapperboard className="h-4 w-4" />
                                    Studio
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/settings" className="cursor-pointer">
                                    <Settings className="h-4 w-4" />
                                    Settings
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onSelect={() => void handleSignOut()}
                            >
                                <LogOut className="h-4 w-4" />
                                Sign out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button variant="default" size="sm" asChild>
                        <Link href="/login">
                            <User className="h-4 w-4" />
                            Sign in
                        </Link>
                    </Button>
                )}
            </div>
        </header>
    );
};
