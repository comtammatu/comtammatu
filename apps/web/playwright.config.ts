import { defineConfig, devices } from "@playwright/test";

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

// import.meta.dirname is available in Node 21.2+ (project uses Node 24)
export const E2E_AUTH_STORAGE = new URL(
  ".playwright/.auth/cashier.json",
  import.meta.url,
).pathname;

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
    // Default e2e suite — functional flows only. Visual specs are
    // excluded so the default `pnpm test:e2e` run does not fail when
    // baseline PNGs are missing (they need an explicit
    // `--project=visual --update-snapshots` bootstrap first).
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: E2E_AUTH_STORAGE,
      },
      dependencies: ["setup"],
      testIgnore: /visual\//,
    },
    // Visual regression — opt-in. Run with:
    //   pnpm test:e2e --project=visual --update-snapshots   (bootstrap)
    //   pnpm test:e2e --project=visual                      (verify)
    // Commit the resulting PNGs under apps/web/e2e/visual/__screenshots__/.
    {
      name: "visual",
      testMatch: /visual\/.*\.spec\.ts/,
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
