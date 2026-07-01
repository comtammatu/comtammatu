import { test, expect } from "@playwright/test";

/**
 * Visual baseline — light-mode regression guard for Má Tư Design System runtime.
 *
 * What this catches:
 *   - Theme drift in `packages/ui/src/styles/globals.css` (Zone A, B, or C)
 *   - Hardcoded Tailwind palette colors creeping back into components
 *   - Runtime drift that re-enables dark mode
 *   - Print stylesheet regressions on `#pos-receipt`
 *
 * Bootstrap baselines on first run:
 *   pnpm test:e2e --update-snapshots
 * (commit the resulting .png files under apps/web/e2e/visual/__screenshots__/)
 *
 * Routes covered: most-trafficked surfaces with cashier auth.
 * Branch id 1 must exist in the test DB (same one used by payment-cash.spec.ts).
 */

const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "pos-desktop", path: "/br/1/pos" },
  { name: "kds-queue", path: "/br/1/kds" },
  // Wave 3b: /inventory/dashboard now redirects to /inventory. Snapshot rebaseline pending.
  { name: "inventory-dashboard", path: "/inventory?branchId=1" },
  { name: "inventory-stock", path: "/inventory/stock?branchId=1" },
  { name: "employee-portal", path: "/employee" },
];

test.describe("Theme baseline — light mode", () => {
  test.use({ colorScheme: "light" });

  for (const route of ROUTES) {
    test(`light · ${route.name}`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      // Settle async data fetches that finish post-networkidle (RSC streamed UI).
      await page.waitForTimeout(800);
      await expect(page).toHaveScreenshot(`${route.name}-light.png`, {
        fullPage: true,
        animations: "disabled",
        // Mask volatile content (timestamps, live counters, randomized order ids)
        // before comparing — prevents flakes on cron-driven dashboard widgets.
        mask: [
          page.locator("[data-volatile='true']"),
          page.locator("time"),
          page.locator("[data-test-volatile]"),
        ],
      });
    });
  }
});

test.describe("Theme runtime — dark OS preference remains light", () => {
  test.use({ colorScheme: "dark" });

  for (const route of ROUTES) {
    test(`forced light · ${route.name}`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
      await expect(page.locator("html")).toHaveClass(/\blight\b/);
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
    });
  }
});
