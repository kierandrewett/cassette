"use client";

import { useState } from "react";

import { gravatarUrl, gravatarUrlFromHash } from "@/lib/gravatar";
import { cn } from "@/lib/utils";

import { InitialsAvatar } from "./InitialsAvatar";

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

// Site-wide user avatar.
//
// Resolution order:
//   1. user.image (explicit upload)
//   2. libravatar/gravatar URL keyed on hash (or email)
//   3. <InitialsAvatar /> — SVG roundel with deterministic gradient.
//
// The SVG fallback is rendered behind the <img>, so when libravatar 404s
// (we ask for ?d=404) the image's onError just hides itself and the SVG
// shows through. Single source of truth for the gradient + initials —
// LeftRail, ChannelHeader, comments, etc. all share the same look via
// InitialsAvatar.
export const UserAvatar = ({ user, size = 32, className }: UserAvatarProps) => {
    const px = Math.max(80, size * 2);
    const src =
        user.image ??
        (user.gravatarHash ? gravatarUrlFromHash(user.gravatarHash, px) : null) ??
        (user.email ? gravatarUrl(user.email, px) : null);
    const [failed, setFailed] = useState(false);
    // Stable seed for the gradient: prefer the gravatar hash (per-user
    // unique + immutable), fall back to email, then name.
    const seed = user.gravatarHash ?? user.email ?? user.name ?? "anon";

    return (
        <span
            className={cn("relative inline-flex flex-shrink-0 overflow-hidden rounded-full", className)}
            style={{ width: size, height: size }}
            aria-hidden="true"
        >
            <InitialsAvatar name={user.name} seed={seed} size={size} />
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
