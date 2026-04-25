import { test, expect } from "@playwright/test";

/**
 * Visual baseline — light + dark mode regression guard for shadcn preset b1GN1lxvE.
 *
 * What this catches:
 *   - Theme drift in `packages/ui/src/styles/globals.css` (Zone A, B, or C)
 *   - Hardcoded Tailwind palette colors creeping back into components
 *   - Missing/broken dark-mode variants
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
  { name: "inventory-dashboard", path: "/inventory/dashboard?branchId=1" },
  { name: "admin-trust", path: "/admin/inventory/trust?branchId=1" },
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

test.describe("Theme baseline — dark mode", () => {
  test.use({ colorScheme: "dark" });

  for (const route of ROUTES) {
    test(`dark · ${route.name}`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
      await expect(page).toHaveScreenshot(`${route.name}-dark.png`, {
        fullPage: true,
        animations: "disabled",
        mask: [
          page.locator("[data-volatile='true']"),
          page.locator("time"),
          page.locator("[data-test-volatile]"),
        ],
      });
    });
  }
});
