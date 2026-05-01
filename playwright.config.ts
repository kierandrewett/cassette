import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = process.env["E2E_BASE_URL"] ?? `http://localhost:${PORT}`;

// Playwright e2e config.
//
// The tests assume a running cassette stack at $E2E_BASE_URL with a fresh
// database. The local recipe is:
//
//   docker compose --profile full down -v
//   docker compose --profile full up -d
//   yarn e2e
//
// Or against `yarn dev`:
//
//   docker compose down -v && docker compose up -d db
//   yarn dev &  yarn e2e

export default defineConfig({
    testDir: "./e2e",
    timeout: 60_000,
    expect: {
        timeout: 5_000,
    },
    fullyParallel: false,
    workers: 1,
    reporter: process.env["CI"] ? [["github"], ["html"]] : [["list"]],
    use: {
        baseURL: BASE_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
