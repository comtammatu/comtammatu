import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * E2E test configuration.
 *
 * Prerequisites to run:
 *   1. pnpm dev must be running (or set CI=true for webServer auto-start)
 *   2. Create a test cashier account in Supabase:
 *      - role: cashier
 *      - branch_id: set to a test branch that has menu items + recipes
 *   3. Copy .env.test.local.example → .env.test.local and fill in credentials
 *
 * Run: pnpm test:e2e
 */

export const E2E_AUTH_STORAGE = path.join(
  __dirname,
  ".playwright/.auth/cashier.json",
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // payment tests mutate DB state — run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Setup: login once, save auth state
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Run E2E tests using saved auth state
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: E2E_AUTH_STORAGE,
      },
      dependencies: ["setup"],
    },
  ],
  // Auto-start Next.js dev server in CI
  webServer: process.env.CI
    ? {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
