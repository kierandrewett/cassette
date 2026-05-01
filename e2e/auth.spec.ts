import { expect, test } from "@playwright/test";

const stamp = () => Date.now().toString(36);

test.describe("auth", () => {
    test("sign up redirects to /studio and the session sticks", async ({ page }) => {
        const email = `e2e-${stamp()}@cassette.local`;
        const password = "playwright-password-1234";
        const name = "Playwright Tester";

        await page.goto("/register");
        await expect(page).toHaveTitle(/cassette/);

        await page.getByLabel(/name/i).fill(name);
        await page.getByLabel(/email/i).fill(email);
        await page.getByLabel(/^password$/i).fill(password);
        await page.getByRole("button", { name: /create account|sign up/i }).click();

        // autoSignIn=true on Better-Auth — sign-up redirects to /studio.
        await page.waitForURL(/\/studio/, { timeout: 30_000 });

        // Session sticks across navigation.
        await page.goto("/studio");
        await page.waitForURL(/\/studio/, { timeout: 10_000 });
    });

    test("sign in with bad password keeps you on /login", async ({ page }) => {
        await page.goto("/login");
        await page.getByLabel(/email/i).fill("nobody@cassette.local");
        await page.getByLabel(/^password$/i).fill("definitely-not-correct");
        await page.getByRole("button", { name: /sign in/i }).click();

        // No redirect; the form should stay on /login and surface an error.
        await page.waitForTimeout(2_000);
        expect(page.url()).toMatch(/\/login/);
    });

    test("forgot-password page renders", async ({ page }) => {
        await page.goto("/forgot-password");
        await expect(page.getByLabel(/email/i)).toBeVisible();
        await expect(page.getByRole("button", { name: /send|reset/i })).toBeVisible();
    });
});
