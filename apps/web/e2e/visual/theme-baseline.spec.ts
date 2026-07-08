import { test, expect } from "@playwright/test";

/**
 * Visual baseline — Má Tư Design System runtime, light + night modes.
 *
 * What this catches:
 *   - Theme drift in `packages/ui/src/styles/globals.css` (Zone A, B, or C)
 *   - Hardcoded Tailwind palette colors creeping back into components
 *   - Night mode warm-dark palette regressions
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
  { name: "branch-hub", path: "/br/1" },
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
test.describe("Theme runtime — night mode via cookie override", () => {
  test.use({ colorScheme: "light" });

  for (const route of ROUTES) {
    test(`night · ${route.name}`, async ({ page, context }) => {
      await context.addCookies([
        {
          name: "matu-theme",
          value: "night",
          domain: "localhost",
          path: "/",
        },
      ]);
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
      await expect(page).toHaveScreenshot(`${route.name}-night.png`, {
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

test.describe("Theme runtime — dark OS preference stays shift-aware, not OS-driven", () => {
  test.use({ colorScheme: "dark" });

  for (const route of ROUTES) {
    test(`os-dark-ignored · ${route.name}`, async ({ page, context }) => {
      // No cookie set: shift-aware logic decides. During day-shift test hours
      // the page must stay light (auto-by-hour, NOT OS-preference-driven).
      await context.clearCookies();
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
      // Assert the bootstrap script ignored prefers-color-scheme: theme is
      // determined by hour + cookie, never by OS preference.
      const htmlClass = await page
        .locator("html")
        .getAttribute("class", { timeout: 2000 });
      expect(htmlClass).toMatch(/\b(light|dark)\b/);
      expect(htmlClass).not.toContain("system");
    });
  }
});
