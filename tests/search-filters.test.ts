import { describe, expect, it } from "vitest";

import {
    parseSearchFilters,
    serialiseSearchFilters,
    mutateFilter,
    type SearchFilters,
} from "@/components/search/filterParams";

// ---------------------------------------------------------------------------
// parseSearchFilters
// ---------------------------------------------------------------------------

describe("parseSearchFilters", () => {
    it("returns empty q and no filters when params are empty", () => {
        const result = parseSearchFilters(new URLSearchParams());
        expect(result.q).toBe("");
        expect(result.uploadedWithin).toBeUndefined();
        expect(result.duration).toBeUndefined();
        expect(result.hasCaptions).toBeUndefined();
        expect(result.type).toBeUndefined();
    });

    it("parses q correctly", () => {
        const result = parseSearchFilters(new URLSearchParams("q=hello+world"));
        expect(result.q).toBe("hello world");
    });

    it("parses all valid uploadedWithin values", () => {
        for (const v of ["hour", "today", "week", "month", "year"] as const) {
            const result = parseSearchFilters(new URLSearchParams(`q=x&uploadedWithin=${v}`));
            expect(result.uploadedWithin).toBe(v);
        }
    });

    it("ignores invalid uploadedWithin", () => {
        const result = parseSearchFilters(new URLSearchParams("q=x&uploadedWithin=yesterday"));
        expect(result.uploadedWithin).toBeUndefined();
    });

    it("parses all valid duration values", () => {
        for (const v of ["short", "medium", "long"] as const) {
            const result = parseSearchFilters(new URLSearchParams(`q=x&duration=${v}`));
            expect(result.duration).toBe(v);
        }
    });

    it("ignores invalid duration", () => {
        const result = parseSearchFilters(new URLSearchParams("q=x&duration=epic"));
        expect(result.duration).toBeUndefined();
    });

    it("parses hasCaptions=true", () => {
        const result = parseSearchFilters(new URLSearchParams("q=x&hasCaptions=true"));
        expect(result.hasCaptions).toBe(true);
    });

    it("parses hasCaptions=false", () => {
        const result = parseSearchFilters(new URLSearchParams("q=x&hasCaptions=false"));
        expect(result.hasCaptions).toBe(false);
    });

    it("ignores invalid hasCaptions", () => {
        const result = parseSearchFilters(new URLSearchParams("q=x&hasCaptions=maybe"));
        expect(result.hasCaptions).toBeUndefined();
    });

    it("parses all valid type values", () => {
        for (const v of ["video", "channel", "playlist"] as const) {
            const result = parseSearchFilters(new URLSearchParams(`q=x&type=${v}`));
            expect(result.type).toBe(v);
        }
    });

    it("ignores invalid type", () => {
        const result = parseSearchFilters(new URLSearchParams("q=x&type=reel"));
        expect(result.type).toBeUndefined();
    });

    it("accepts a plain object instead of URLSearchParams", () => {
        const result = parseSearchFilters({ q: "test", duration: "short" });
        expect(result.q).toBe("test");
        expect(result.duration).toBe("short");
    });
});

// ---------------------------------------------------------------------------
// serialiseSearchFilters
// ---------------------------------------------------------------------------

describe("serialiseSearchFilters", () => {
    it("omits undefined filters", () => {
        const qs = serialiseSearchFilters({ q: "cats" });
        expect(qs).toBe("q=cats");
    });

    it("includes all present filters", () => {
        const qs = serialiseSearchFilters({
            q: "dogs",
            uploadedWithin: "week",
            duration: "short",
            hasCaptions: true,
            type: "video",
        });
        const params = new URLSearchParams(qs);
        expect(params.get("q")).toBe("dogs");
        expect(params.get("uploadedWithin")).toBe("week");
        expect(params.get("duration")).toBe("short");
        expect(params.get("hasCaptions")).toBe("true");
        expect(params.get("type")).toBe("video");
    });

    it("serialises hasCaptions=false", () => {
        const qs = serialiseSearchFilters({ q: "x", hasCaptions: false });
        expect(new URLSearchParams(qs).get("hasCaptions")).toBe("false");
    });

    it("returns empty string when q is empty", () => {
        const qs = serialiseSearchFilters({ q: "" });
        // q="" produces no param because the condition is `if (filters.q)`
        expect(qs).toBe("");
    });
});

// ---------------------------------------------------------------------------
// mutateFilter
// ---------------------------------------------------------------------------

describe("mutateFilter", () => {
    const base: SearchFilters = { q: "kittens", uploadedWithin: "week", duration: "short" };

    it("returns a /search URL", () => {
        const url = mutateFilter(base, {});
        expect(url).toMatch(/^\/search/);
    });

    it("mutates a single filter while preserving others", () => {
        const url = mutateFilter(base, { duration: "long" });
        const qs = new URLSearchParams(url.split("?")[1]);
        expect(qs.get("q")).toBe("kittens");
        expect(qs.get("uploadedWithin")).toBe("week");
        expect(qs.get("duration")).toBe("long");
    });

    it("clears a filter by setting it to undefined", () => {
        const url = mutateFilter(base, { uploadedWithin: undefined });
        const qs = new URLSearchParams(url.split("?")[1]);
        expect(qs.get("uploadedWithin")).toBeNull();
        expect(qs.get("q")).toBe("kittens");
    });

    it("adds a filter that was not previously set", () => {
        const url = mutateFilter({ q: "birds" }, { hasCaptions: true });
        const qs = new URLSearchParams(url.split("?")[1]);
        expect(qs.get("hasCaptions")).toBe("true");
    });
});
