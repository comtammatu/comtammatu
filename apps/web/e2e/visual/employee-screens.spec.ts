import { test, expect } from "@playwright/test";

/**
 * Branch home staff visual regression — mobile + desktop.
 *
 * Why this exists: the staff surface drifted from the design-system contract
 * (decorative entrance motion, duration-200 in app code, ad-hoc heights/grids)
 * because the deterministic gate could not see review-level drift. This spec is
 * the visual backstop: once a clean baseline is committed, any future layout
 * break or motion/spacing regression on these routes fails CI.
 *
 * Primary viewport is mobile 390px — Branch home is a mobile-first PWA
 * (header + bottom-nav). Desktop/tablet widths are captured too to guard the
 * responsive density variant.
 *
 * Prerequisites (same as the other e2e specs — see playwright.config.ts):
 *   1. A running app: `pnpm dev` (CI auto-starts it).
 *   2. `.env.test.local` with E2E_CASHIER_EMAIL / E2E_CASHIER_PASSWORD and the
 *      Supabase env. The account must be able to open Branch home for branch 1.
 *   3. A SAFE Supabase target — never point this at the production DB.
 *
 * Bootstrap baselines (first run), then verify:
 *   pnpm test:e2e --project=visual --update-snapshots   # writes PNGs
 *   pnpm test:e2e --project=visual                       # verifies
 * Commit the PNGs under apps/web/e2e/visual/__screenshots__/.
 */

const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "branch-home-today", path: "/br/1" },
  { name: "branch-home-shift", path: "/br/1/shift" },
  { name: "branch-home-schedule", path: "/br/1/shift/schedule" },
  {
    name: "branch-home-checkout-approvals",
    path: "/br/1/shift/checkout-approvals",
  },
  { name: "branch-home-count", path: "/br/1/stock/count" },
  { name: "branch-home-payslip", path: "/br/1/profile/payslip" },
  { name: "branch-home-profile", path: "/br/1/profile" },
  { name: "branch-home-leave", path: "/br/1/shift/schedule/leave" },
  { name: "branch-home-clock", path: "/br/1/shift/clock" },
];

const VIEWPORTS: ReadonlyArray<{
  name: string;
  width: number;
  height: number;
}> = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

const MASK_VOLATILE = (page: import("@playwright/test").Page) => [
  page.locator("[data-volatile='true']"),
  page.locator("[data-test-volatile]"),
  page.locator("time"),
];

test.describe("Branch home staff surface — visual baseline (light mode)", () => {
  test.use({ colorScheme: "light" });

  for (const vp of VIEWPORTS) {
    test.describe(vp.name, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const route of ROUTES) {
        test(`${vp.name} · ${route.name}`, async ({ page }) => {
          await page.goto(route.path);
          await page.waitForLoadState("networkidle");
          // Settle async RSC-streamed data that finishes post-networkidle.
          await page.waitForTimeout(800);
          await expect(page).toHaveScreenshot(`${route.name}-${vp.name}.png`, {
            fullPage: true,
            animations: "disabled",
            mask: MASK_VOLATILE(page),
          });
        });
      }
    });
  }
});
