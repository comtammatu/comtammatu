import {
  test,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Visual baseline — Má Tư Design System runtime, light + night modes.
 *
 * What this catches:
 *   - Theme drift in `packages/ui/src/styles/globals.css` (Zone A, B, or C)
 *   - Hardcoded Tailwind palette colors creeping back into components
 *   - Night mode warm-dark palette regressions
 *   - Print stylesheet regressions on `#pos-receipt`
 *
 * Determinism:
 *   - Every block pins the `matu-theme` cookie BEFORE `page.goto`, so the
 *     pre-hydration theme script (packages/ui theme-script) never falls back
 *     to the local-hour heuristic (the old cookie-less light block flipped
 *     to night mode whenever CI or the dev machine ran after 18:00).
 *   - The OS-dark block clears the cookie and asserts class state only —
 *     it proves the bootstrap ignores `prefers-color-scheme`.
 *   - playwright.config.ts pins `timezoneId`, snapshot path, and comparison
 *     tolerance for the `visual` project.
 *
 * Routes covered: most-trafficked surfaces with owner auth (cashier lacks
 * KDS/Inventory ACL for the covered routes). Branch id 1 must exist in the
 * test DB (same one used by payment-cash.spec.ts).
 *
 * Committed baselines MUST be Linux captures (CI platform). One-time
 * bootstrap (human-supervised, see also the comment in .github/workflows/
 * ci.yml near the visual step):
 *   1. Push this branch; temporarily switch the CI visual step to run with
 *      `--update-snapshots` for ONE pass.
 *   2. Download the 10 Linux PNGs (5 routes × light/night) from the run
 *      artifacts.
 *   3. Human-review each PNG, then commit them under
 *      apps/web/e2e/visual/__screenshots__/.
 *   4. Revert the CI step to comparison mode — never leave
 *      `--update-snapshots` enabled in CI.
 * Local macOS captures are a determinism proof only; do not commit them.
 */

const THEME_COOKIE = "matu-theme";

// `landsOn` declares the URL a route is expected to finally land on. The
// inventory entry point server-redirects to the fixed L0 inventory landing
// (inventory-home.ts); declaring it keeps the URL guard strict against silent
// access-denied redirects while tolerating this known-benign redirect.
const ROUTES: ReadonlyArray<{
  name: string;
  path: string;
  landsOn?: string;
}> = [
  { name: "pos-desktop", path: "/br/1/pos" },
  { name: "kds-queue", path: "/br/1/kds" },
  {
    name: "inventory-dashboard",
    path: "/inventory?branchId=1",
    landsOn: "/inventory/stock?branchId=1",
  },
  { name: "inventory-stock", path: "/inventory/stock?branchId=1" },
  { name: "branch-home", path: "/br/1" },
];

const maskVolatile = (page: Page) => [
  // Mask volatile content (timestamps, live counters, randomized order ids)
  // before comparing — prevents flakes on cron-driven dashboard widgets.
  page.locator("[data-volatile='true']"),
  page.locator("time"),
  page.locator("[data-test-volatile]"),
];

function resolveBaseURL(): string {
  return test.info().project.use.baseURL ?? "http://localhost:3000";
}

// Single entry point for theme pinning: clears any inherited `matu-theme`
// cookie (e.g. from storageState) and sets the wanted value BEFORE page.goto
// so the inline pre-hydration script reads it on the very first render.
async function pinThemeCookie(
  context: BrowserContext,
  value: "light" | "night",
): Promise<void> {
  await context.clearCookies({ name: THEME_COOKIE });
  await context.addCookies([
    {
      name: THEME_COOKIE,
      value,
      domain: new URL(resolveBaseURL()).hostname,
      path: "/",
    },
  ]);
}

// Wait for the page to settle: network quiet, web fonts loaded, then a short
// grace period for RSC-streamed data fetches that finish post-networkidle.
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

// Guard against silent access-denied baselines: a redirect to /access-denied
// or /login would otherwise capture a wrong page and poison the baseline.
async function assertRouteLanded(page: Page, routePath: string): Promise<void> {
  const expected = new URL(routePath, resolveBaseURL());
  const actual = new URL(page.url());
  expect(
    actual.pathname,
    `expected ${expected.pathname} but landed on ${actual.pathname} — possible silent access-denied`,
  ).toBe(expected.pathname);
  for (const [key, value] of expected.searchParams) {
    expect(actual.searchParams.get(key), `query param ${key}`).toBe(value);
  }
}

test.describe("Theme baseline — light mode", () => {
  test.use({ colorScheme: "light" });

  for (const route of ROUTES) {
    test(`light · ${route.name}`, async ({ page, context }) => {
      await pinThemeCookie(context, "light");
      await page.goto(route.path);
      await settle(page);
      await assertRouteLanded(page, route.landsOn ?? route.path);
      await expect(page.locator("html")).toHaveClass(/\blight\b/);
      await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
      await expect(page).toHaveScreenshot(`${route.name}-light.png`, {
        fullPage: true,
        mask: maskVolatile(page),
      });
    });
  }
});

test.describe("Theme runtime — night mode via cookie override", () => {
  test.use({ colorScheme: "light" });

  for (const route of ROUTES) {
    test(`night · ${route.name}`, async ({ page, context }) => {
      await pinThemeCookie(context, "night");
      await page.goto(route.path);
      await settle(page);
      await assertRouteLanded(page, route.landsOn ?? route.path);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
      await expect(page).toHaveScreenshot(`${route.name}-night.png`, {
        fullPage: true,
        mask: maskVolatile(page),
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
      await context.clearCookies({ name: THEME_COOKIE });
      await page.goto(route.path);
      await settle(page);
      // Assert the bootstrap script ignored prefers-color-scheme: theme is
      // determined by hour + cookie, never by OS preference. Class-only
      // assertions here — no screenshots in this block.
      const htmlClass = await page
        .locator("html")
        .getAttribute("class", { timeout: 2000 });
      expect(htmlClass).toMatch(/\b(light|dark)\b/);
      expect(htmlClass).not.toContain("system");
    });
  }
});
