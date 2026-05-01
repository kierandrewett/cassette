// Shared locale config. Kept tiny so it can be imported from both server
// (i18n/request.ts) and client (locale-switcher submenu) without dragging
// next-intl's runtime into the client bundle.

export const SUPPORTED_LOCALES = ["en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// Cookie name read by the server-side request loader. Match the rest of the
// app's `cassette.*` namespacing.
export const LOCALE_COOKIE = "cassette.locale";

export const isLocale = (value: string | undefined | null): value is Locale =>
    !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
