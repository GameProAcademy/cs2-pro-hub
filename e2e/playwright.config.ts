import { defineConfig, devices } from "@playwright/test";

/**
 * PM2 browser E2E. Runs against a real deployment (default: production) with two real accounts whose
 * credentials come only from environment variables (GitHub Actions secrets).
 *
 * Privacy (the repository is public): no trace, no video and no screenshot are recorded, because they
 * would capture the typed password and account data. The evidence is the JSON summary written by the
 * tests, which holds statuses and counts only.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "https://gamepro.network",
    trace: "off",
    video: "off",
    screenshot: "off",
    locale: "pt-BR",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
