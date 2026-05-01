import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        environment: "node",
        globals: false,
        // Load .env so any test that pulls in @/env (transitively via the
        // db client or the fanout helpers) does not crash on missing keys.
        setupFiles: ["./tests/setup.ts"],
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
});
