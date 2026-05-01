import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

// next-intl loads messages on every server render. We resolve the active
// locale from (in order): the `cassette.locale` cookie set by the avatar
// submenu, the browser's Accept-Language header, then DEFAULT_LOCALE.
//
// Today there's only one locale; the framework is wired up so future
// translations land by dropping a `locales/<lang>.json` file and adding it
// to SUPPORTED_LOCALES.

const pickFromAcceptLanguage = (header: string | null | undefined): Locale | null => {
    if (!header) return null;
    // Accept-Language is q-weighted; the first tag is overwhelmingly the
    // user's preferred language and any reordering by quality is overkill
    // for the small set of locales we support. Strip subtags ("en-GB" ->
    // "en") so a UK browser resolves to "en" rather than missing.
    const first = header.split(",")[0]?.split(";")[0]?.trim().split("-")[0]?.toLowerCase();
    return isLocale(first) ? first : null;
};

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const headerStore = await headers();

    const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
    const cookieLocale = isLocale(fromCookie) ? fromCookie : null;
    const headerLocale = pickFromAcceptLanguage(headerStore.get("accept-language"));

    const locale: Locale = cookieLocale ?? headerLocale ?? DEFAULT_LOCALE;

    // Dynamic import keeps the JSON out of the edge bundle when only one
    // locale is in play, and naturally code-splits as more are added.
    const messages = (await import(`./locales/${locale}.json`)).default as Record<string, unknown>;

    return { locale, messages };
});
