// Centralised helpers for rendering an initials avatar — used as a fallback
// everywhere a real image is missing (libravatar 404, channel without an
// uploaded avatar, comment author with no avatar set, etc.).
//
// Two things were inconsistent across the codebase before this module
// existed:
//   1. Some callsites used `name.slice(0, 2).toUpperCase()` (first two
//      characters), others used the first character only, others used the
//      first letter of each word. Result: the same channel showed up as
//      "KI" in the sidebar, "K" in the channel header, "KD" in the comment
//      composer.
//   2. Background colour was always grey, which made it hard to
//      distinguish channels at a glance.
//
// `getInitials` returns the first letter of each whitespace-separated word
// (max two letters) — e.g. "Kieran Drewett" -> "KD", "Acme" -> "A",
// "Acme Corp Ltd" -> "AC". `getAvatarColor` derives a deterministic HSL
// pair (background + foreground) from the input string so the same name
// always gets the same hue.

const stripDiacritics = (input: string): string =>
    input.normalize("NFD").replace(/[̀-ͯ]/g, "");

export const getInitials = (name: string | null | undefined): string => {
    if (!name) return "?";
    const cleaned = stripDiacritics(name).trim();
    if (!cleaned) return "?";
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    if (words.length === 1) {
        // Single word — take the first character. Keeps "Acme" -> "A"
        // rather than "AC" which the user found surprising for one-name
        // channels.
        return words[0]!.charAt(0).toUpperCase();
    }
    return (words[0]!.charAt(0) + words[words.length - 1]!.charAt(0)).toUpperCase();
};

// Deterministic hash → 0-359 hue. djb2-ish, not cryptographic — just stable.
const hashHue = (input: string): number => {
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
        h = (h * 33) ^ input.charCodeAt(i);
    }
    // Skip the orange/red/yellow band that clashes with --destructive
    // (which sits ~ 0..50). Map to 60..360.
    return 60 + (Math.abs(h) % 300);
};

export interface AvatarColor {
    /** CSS background string — a 135° linear gradient between two harmonised hues. */
    background: string;
    /** Foreground / text colour for legibility on the bg. */
    foreground: string;
}

// Return a stable gradient + fg pair for the given name. The gradient runs
// between the primary hue and a complementary hue offset 40 deg away, both
// at the same saturation/lightness so the result reads as a single
// confident colour rather than a wash. Sat / lightness fixed across the
// app for visual consistency — only the hue varies.
export const getAvatarColor = (name: string | null | undefined): AvatarColor => {
    const hue = hashHue((name ?? "").trim().toLowerCase() || "?");
    const hue2 = (hue + 40) % 360;
    return {
        background: `linear-gradient(135deg, hsl(${hue}deg 55% 45%), hsl(${hue2}deg 55% 35%))`,
        foreground: "hsl(0deg 0% 100% / 0.95)",
    };
};
