import { defineConfig } from "@playwright/test";

// Failure accessibility snapshots can include credential input values even when
// screenshots/traces are off. Disable Playwright copy-prompt page capture.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    // Auth material and hidden reports must not enter trace/screenshot artifacts.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
