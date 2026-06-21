import { test, expect } from "@playwright/test";

/**
 * Employee surface visual regression — every Employee screen, mobile + desktop.
 *
 * Why this exists: the Employee surface drifted from the design-system contract
 * (decorative entrance motion, duration-200 in app code, ad-hoc heights/grids)
 * because the deterministic gate could not see review-level drift. This spec is
 * the visual backstop: once a clean baseline is committed, any future layout
 * break or motion/spacing regression on these routes fails CI.
 *
 * Primary viewport is mobile 390px — the Employee surface is a mobile-first PWA
 * (header + bottom-nav). Desktop is captured too to guard the density variant.
 *
 * Prerequisites (same as the other e2e specs — see playwright.config.ts):
 *   1. A running app: `pnpm dev` (CI auto-starts it).
 *   2. `.env.test.local` with E2E_CASHIER_EMAIL / E2E_CASHIER_PASSWORD and the
 *      Supabase env. The account must be able to open /employee/* (any
 *      authenticated staff member can).
 *   3. A SAFE Supabase target — never point this at the production DB.
 *
 * Bootstrap baselines (first run), then verify:
 *   pnpm test:e2e --project=visual --update-snapshots   # writes PNGs
 *   pnpm test:e2e --project=visual                       # verifies
 * Commit the PNGs under apps/web/e2e/visual/__screenshots__/.
 */

const ROUTES: ReadonlyArray<{ name: string; path: string }> = [
  { name: "employee-portal", path: "/employee" },
  { name: "employee-attendance", path: "/employee/attendance" },
  { name: "employee-schedule", path: "/employee/schedule" },
  { name: "employee-tasks", path: "/employee/tasks" },
  { name: "employee-checkout-approvals", path: "/employee/checkout-approvals" },
  { name: "employee-payslip", path: "/employee/payslip" },
  { name: "employee-permissions", path: "/employee/permissions" },
  { name: "employee-profile", path: "/employee/profile" },
  { name: "employee-leave", path: "/employee/leave" },
  { name: "employee-clock", path: "/employee/clock" },
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

test.describe("Employee surface — visual baseline (light mode)", () => {
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
          await expect(page).toHaveScreenshot(
            `${route.name}-${vp.name}.png`,
            {
              fullPage: true,
              animations: "disabled",
              mask: MASK_VOLATILE(page),
            },
          );
        });
      }
    });
  }
});
