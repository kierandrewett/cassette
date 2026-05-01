import { expect, test } from "@playwright/test";

test.describe("health", () => {
    test("/api/health returns ok", async ({ request }) => {
        const res = await request.get("/api/health");
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        expect(body.checks?.db).toBe("ok");
    });

    test("/api/trpc/health.ping returns the wire shape", async ({ request }) => {
        const res = await request.get("/api/trpc/health.ping");
        expect(res.status()).toBe(200);
        const body = await res.json();
        expect(body?.result?.data?.json?.ok).toBe(true);
    });

    test("home redirects unauthenticated visitors to /login marketing OR renders the hero", async ({ page }) => {
        const res = await page.goto("/");
        expect(res?.status()).toBeLessThan(500);
        // Either the logged-out hero or the /home redirect target is fine; both
        // include the cassette wordmark.
        await expect(page.getByText(/cassette/i)).toBeVisible();
    });
});
