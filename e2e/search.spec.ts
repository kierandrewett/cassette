import { expect, test } from "@playwright/test";

test.describe("search", () => {
    test("/search renders all three tabs", async ({ page }) => {
        await page.goto("/search?q=cassette");
        await expect(page.getByRole("link", { name: /^videos$/i })).toBeVisible();
        await expect(page.getByRole("link", { name: /^channels$/i })).toBeVisible();
        await expect(page.getByRole("link", { name: /^playlists$/i })).toBeVisible();
    });

    test("/search?tab=channels renders the channels surface", async ({ page }) => {
        await page.goto("/search?q=cassette&tab=channels");
        // Either we see results or the empty-state copy. Either way the
        // SearchTabs strip and the channels tab marker survive.
        await expect(page.getByRole("link", { name: /^channels$/i, exact: true })).toBeVisible();
    });
});
