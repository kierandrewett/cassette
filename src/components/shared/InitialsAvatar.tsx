import { getAvatarColor, getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface InitialsAvatarProps {
    /** Display name — initials are derived from this. */
    name: string | null | undefined;
    /** Stable identifier the gradient is keyed on (channel handle, user id,
     *  gravatar hash). Defaults to `name` when omitted. */
    seed?: string | null | undefined;
    /** Pixel size of the rendered SVG square. */
    size?: number;
    className?: string;
    /** Outer SVG title for accessibility. Falls back to "<name>'s avatar". */
    title?: string;
}

// Single source of truth for the initials avatar.
//
// Renders one circular SVG that contains its own linear gradient (keyed on
// `seed`) plus the `<text>` element drawing the initials. Using SVG instead
// of the previous `<span>` + CSS-gradient + `<span>` text composition means:
//
//   - Initials are anchored via dominant-baseline + text-anchor, so they
//     are pixel-perfect centred regardless of font metrics or container
//     box model. The flex / inline-block drift between surfaces (sidebar
//     row vs channel header vs comment row) is gone.
//   - The gradient is part of the rendered glyph rather than separate CSS
//     so reuse-as-image (favicon, OG card, og:image fallback) is trivial.
//
// The SVG inherits the requested pixel size via width/height; the viewBox
// is constant 100×100 so the internal coordinates always work.
export const InitialsAvatar = ({ name, seed, size = 32, className, title }: InitialsAvatarProps) => {
    const initials = getInitials(name);
    const palette = getAvatarColor(seed ?? name);

    // Each instance gets a unique gradient id so multiple avatars on the
    // same page don't collide. The id is derived from the seed so SSR + CSR
    // produce the same DOM.
    const safeSeed = (seed ?? name ?? "anon").toString().replace(/[^a-zA-Z0-9_-]/g, "_");
    const gradientId = `iav-${safeSeed}`;

    // Pull the two HSL stops back out of the gradient string the helper
    // returned so we can drop them into <stop> elements. The helper format
    // is: linear-gradient(135deg, hsl(...), hsl(...)).
    const stops = palette.background.match(/hsl\([^)]*\)/g) ?? ["#444", "#222"];
    const start = stops[0]!;
    const end = stops[stops.length - 1]!;

    // Font size is a fraction of the viewBox so text fills the circle
    // proportionally; tracking-wider / font-weight handled directly on the
    // text node so it survives across browsers without depending on a
    // surrounding stylesheet.
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={size}
            height={size}
            className={cn("block flex-shrink-0", className)}
            role="img"
            aria-label={title ?? (name ? `${name}'s avatar` : "Avatar")}
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={start} />
                    <stop offset="100%" stopColor={end} />
                </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="50" fill={`url(#${gradientId})`} />
            {/* Drop letter-spacing here: text-anchor="middle" measures the
                box including any trailing tracking, which with two letters
                produces a visible left-shift. Keep tracking off and rely
                on the bold weight to give the glyphs presence. */}
            <text
                x="50"
                y="50"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily='system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                fontSize="42"
                fontWeight="700"
                fill={palette.foreground}
            >
                {initials}
            </text>
        </svg>
    );
};
