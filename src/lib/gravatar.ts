import { md5 } from "js-md5";

// Libravatar / Gravatar avatar URLs derived from the user's email.
//
// Libravatar (https://www.libravatar.org) is a federated portrait host that
// falls back to Gravatar for hashes it does not own, so a single base URL
// covers both networks. We pass `d=mp` (mystery person silhouette) so a user
// with no registered avatar gets a generic placeholder instead of a 404.
//
// The hash is md5 of the lowercased + trimmed email per the Gravatar spec.
// Pure-JS md5 (rather than node:crypto) so this module is isomorphic — it
// imports cleanly into client bundles via UserAvatar.

const hash = (input: string): string => md5(input.trim().toLowerCase());

// Public so server-side code can compute a hash once and ship it to the client
// without leaking the raw email address — see comment list payload.
export const gravatarHash = (email: string): string => hash(email);

export const gravatarUrl = (email: string, size = 80): string => gravatarUrlFromHash(gravatarHash(email), size);

// `d=404` asks the upstream to return an actual 404 when the user has not
// registered a libravatar (instead of the generic mystery-person silhouette
// which we can't visually distinguish). The client falls through to its
// initials roundel when the load errors.
export const gravatarUrlFromHash = (hash: string, size = 80): string =>
    `https://www.libravatar.org/avatar/${hash}?s=${size}&d=404`;

// Initials fallback used when we want to render entirely on-server with no
// network round trip — e.g. a tiny avatar in a comment row that we'd rather
// not block on a third-party CDN.
export const userInitials = (name: string | null | undefined): string => {
    if (!name) return "?";
    return name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
};
