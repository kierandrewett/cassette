"use client";

import { useState } from "react";

import { gravatarUrl, gravatarUrlFromHash } from "@/lib/gravatar";
import { getAvatarColor, getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
    user: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
        // Pre-hashed Gravatar key. Prefer this over `email` for any payload
        // that crosses the server/client boundary so we never leak addresses.
        gravatarHash?: string | null;
    };
    size?: number;
    className?: string;
}

// Site-wide user avatar with libravatar/gravatar fallback.
//
// Resolution order:
//   1. user.image (explicit upload)
//   2. libravatar/gravatar URL keyed on hash (or email)
//   3. initials roundel — first letter of first + last word, on a deterministic
//      hue gradient derived from the name so each user/channel reads as a
//      distinct colour at a glance.
//
// We use a plain <img> with onError so a 404 from libravatar (which the
// helper requests via ?d=404 — see lib/gravatar.ts) collapses to the
// initials view instead of leaving a broken-image placeholder. Initials
// are always rendered behind the image so they show through on load
// failure with no extra paint.
export const UserAvatar = ({ user, size = 32, className }: UserAvatarProps) => {
    const px = Math.max(80, size * 2);
    const src =
        user.image ??
        (user.gravatarHash ? gravatarUrlFromHash(user.gravatarHash, px) : null) ??
        (user.email ? gravatarUrl(user.email, px) : null);
    const initials = getInitials(user.name);
    const palette = getAvatarColor(user.name);
    const [failed, setFailed] = useState(false);

    return (
        <span
            className={cn(
                "relative inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border/40",
                className,
            )}
            style={{
                width: size,
                height: size,
                fontSize: Math.max(10, size * 0.42),
                background: palette.background,
                color: palette.foreground,
            }}
            aria-hidden="true"
        >
            <span className="font-semibold tracking-tight">{initials}</span>
            {src && !failed && (
                <img
                    src={src}
                    alt=""
                    width={size}
                    height={size}
                    loading="lazy"
                    decoding="async"
                    onError={() => setFailed(true)}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            )}
        </span>
    );
};
