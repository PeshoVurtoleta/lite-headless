// @zakkster/lite-headless / playwright.config.js
//
// Browser-side test harness for paths that happy-dom can't cover --
// real layout, real pointer geometry, real focus events. Complements
// the node:test suite (which covers logic + ARIA + lifecycle).
//
// Usage:
//   npm install                                  # installs playwright
//   npx playwright install chromium              # one-time browser fetch
//   npm run test:browser                          # full suite
//   npm run test:browser -- --headed              # watch it run
//   npm run test:browser -- --ui                  # interactive mode
//
// What the harness covers (and node:test cannot):
//   - menu safe-triangle geometry with real submenu rect
//   - slider drag against a real track bounding rect
//   - popover flip when content would overflow the real viewport
//   - date picker focus with real focus events + tabindex traversal
//   - combobox aria-activedescendant + real scrollIntoView for the
//     highlighted item
//
// What it does NOT cover:
//   - Unit-level logic (state machines, value normalization, dismiss
//     stack interactions) -- node:test owns those.
//   - Visual regression (no screenshots are taken).
//   - Cross-browser matrix beyond chromium; add { name: "firefox" } /
//     { name: "webkit" } projects if you want Firefox / Safari coverage.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./test-browser",
    testMatch: /.*\.spec\.js/,

    // Run tests in parallel within a file by default; one worker keeps
    // shared-DOM tests deterministic if they ever mutate global state.
    fullyParallel: true,
    workers: process.env.CI ? 1 : undefined,

    // Per-test timeout. Drag tests with delay:25 take ~1s; pad generously.
    timeout: 15_000,
    expect: { timeout: 5_000 },

    // Each spec gets a fresh page; the webServer is shared across the run.
    use: {
        baseURL: "http://127.0.0.1:5173",
        viewport: { width: 1024, height: 768 },
        actionTimeout: 5_000,
        // Trace + screenshot on failure for easier debugging
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        // Allow pointing at a pre-installed chromium binary when the
        // playwright-managed download isn't usable (sandboxed CI, locked-
        // down dev images). Set CHROMIUM_BIN=/path/to/chrome to override.
        ...(process.env.CHROMIUM_BIN ? {
            launchOptions: {
                executablePath: process.env.CHROMIUM_BIN,
                args: ["--no-sandbox"],
            },
        } : {}),
    },

    webServer: {
        command: "node test-browser/serve.mjs",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 60 * 1000, // Increase to 60 seconds
        stdout: "pipe",     // Changed from 'ignore' to 'pipe' to see server logs
        stderr: "pipe",     // Changed from 'pipe' to 'pipe' to see server errors
    },

    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        // Uncomment for full cross-browser:
        // { name: "firefox",  use: { ...devices["Desktop Firefox"] } },
        // { name: "webkit",   use: { ...devices["Desktop Safari"]  } },
    ],
});
