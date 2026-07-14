import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { getCashierProfile } from "./helpers/supabase";
import {
  E2E_AUTH_STORAGE,
  E2E_AUTH_STORAGE_MANAGER,
  E2E_AUTH_STORAGE_OWNER,
} from "../playwright.config";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });

const MOBILE = { width: 390, height: 844 };
const TABLET_PORTRAIT = { width: 768, height: 1024 };
const TABLET_LANDSCAPE = { width: 1024, height: 768 };
const DESKTOP = { width: 1440, height: 900 };

const ADMIN_DASHBOARD_PREFIXES = [
  "/admin",
  "/branches",
  "/finance",
  "/hr",
  "/inventory",
  "/menu",
  "/orders",
];
const KNOWN_CONSOLE_NOISE = [
  /https:\/\/va\.vercel-scripts\.com\/v1\/.*violates the following Content Security Policy directive/,
  /violates the following Content Security Policy directive.*https:\/\/va\.vercel-scripts\.com\/v1\//,
];
function parseLoopbackUrl(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? "");
    return url.hostname === "localhost" || url.hostname === "127.0.0.1"
      ? url
      : null;
  } catch {
    return null;
  }
}

const LOCAL_E2E_BASE_URL = parseLoopbackUrl(process.env.E2E_BASE_URL);
const LOCAL_SUPABASE_URL = parseLoopbackUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const ALLOW_LOCAL_NEXT_START_NOISE =
  process.env.E2E_LOCAL_NEXT_START === "true" &&
  LOCAL_E2E_BASE_URL !== null;
const ALLOW_LOCAL_SUPABASE_REALTIME_NOISE =
  ALLOW_LOCAL_NEXT_START_NOISE && LOCAL_SUPABASE_URL !== null;
const LOCAL_VERCEL_SCRIPT_URLS = LOCAL_E2E_BASE_URL
  ? new Set([
      `${LOCAL_E2E_BASE_URL.origin}/_vercel/speed-insights/script.js`,
      `${LOCAL_E2E_BASE_URL.origin}/_vercel/insights/script.js`,
    ])
  : new Set<string>();
const LOCAL_SUPABASE_WEBSOCKET_ORIGIN = LOCAL_SUPABASE_URL
  ? `${LOCAL_SUPABASE_URL.protocol === "https:" ? "wss:" : "ws:"}//${LOCAL_SUPABASE_URL.host}`
  : null;

function isKnownConsoleNoise(message: ConsoleMessage): boolean {
  const text = message.text();
  if (!ALLOW_LOCAL_NEXT_START_NOISE) return false;
  if (
    KNOWN_CONSOLE_NOISE.some((pattern) => pattern.test(text))
  ) {
    return true;
  }

  const locationUrl = message.location().url;
  if (LOCAL_VERCEL_SCRIPT_URLS.has(locationUrl)) {
    return true;
  }

  return (
    [...LOCAL_VERCEL_SCRIPT_URLS].some((scriptUrl) =>
      text.startsWith(`Refused to execute script from '${scriptUrl}'`),
    ) ||
    (ALLOW_LOCAL_SUPABASE_REALTIME_NOISE &&
      LOCAL_SUPABASE_WEBSOCKET_ORIGIN !== null &&
      text.startsWith(
        `Connecting to '${LOCAL_SUPABASE_WEBSOCKET_ORIGIN}/realtime/v1/websocket?`,
      ) &&
      text.includes("violates the following Content Security Policy directive"))
  );
}

function watchPageHealth(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: Array<{ status: number; url: string }> = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (isKnownConsoleNoise(msg)) return;
    consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push({ status: response.status(), url: response.url() });
    }
  });

  return { consoleErrors, pageErrors, serverErrors };
}

async function expectHealthyRoute(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);

  const state = await page.evaluate((adminDashboardPrefixes) => {
    const links = Array.from(document.querySelectorAll("a[href]")).map(
      (link) => link.getAttribute("href") ?? "",
    );
    const text = document.body.innerText;
    return {
      pathname: window.location.pathname,
      overflowX:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - window.innerWidth,
      adminDashboardLinkCount: links.filter((href) =>
        adminDashboardPrefixes.some((prefix) => href.startsWith(prefix)),
      ).length,
      isLoginSurface: /Đăng nhập|Log in to Vercel|Continue with Email/.test(
        text,
      ),
      hasAdminDashboardShell:
        document.querySelector('[data-slot="sidebar-wrapper"]') !== null,
    };
  }, ADMIN_DASHBOARD_PREFIXES);

  expect(state.pathname).toBe(path);
  expect(state.overflowX).toBeLessThanOrEqual(2);
  expect(state.adminDashboardLinkCount).toBe(0);
  expect(state.isLoginSurface).toBe(false);
  expect(state.hasAdminDashboardShell).toBe(false);
}

function expectedOwnerBottomNavCurrentCount(path: string, branchId: number) {
  const base = `/br/${branchId}`;
  if (path === base) return 1;
  if (path.startsWith(`${base}/team`)) return 1;
  if (path.startsWith(`${base}/stock`)) return 1;
  return 0;
}

test.describe("branch route shell ownership", () => {
  test("manager opens its Branch Hub on mobile and desktop", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      storageState: E2E_AUTH_STORAGE_MANAGER,
    });
    const page = await context.newPage();
    const health = watchPageHealth(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForURL((url) => /^\/br\/\d+$/.test(url.pathname));
    const hubPath = new URL(page.url()).pathname;
    expect(hubPath).toMatch(/^\/br\/\d+$/);

    for (const viewport of [
      MOBILE,
      TABLET_PORTRAIT,
      TABLET_LANDSCAPE,
      DESKTOP,
    ]) {
      await page.setViewportSize(viewport);
      await expectHealthyRoute(page, hubPath);
    }

    await page.goto("/inventory/suppliers", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(hubPath);
    await page.goto(`${hubPath}/stock`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(`${hubPath}/stock`);

    expect(health.consoleErrors).toEqual([]);
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
    await context.close();
  });

  test("POS and KDS keep standalone station chrome", async ({ page }) => {
    test.setTimeout(90_000);
    const { branchId } = await getCashierProfile();
    const health = watchPageHealth(page);

    for (const viewport of [MOBILE, DESKTOP]) {
      await page.setViewportSize(viewport);
      for (const station of ["pos", "kds"] as const) {
        await expectHealthyRoute(page, `/br/${branchId}/${station}`);
        await expect(
          page.getByRole("navigation", { name: APP_COPY_VI.operatorAriaLabel }),
        ).toHaveCount(0);
      }
    }

    expect(health.consoleErrors).toEqual([]);
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
  });

  test("dashboard alias redirects while settings and stock stay inside the branch operator shell on mobile", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(MOBILE);
    const { branchId } = await getCashierProfile();
    const health = watchPageHealth(page);

    await page.goto(`/br/${branchId}/dashboard`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(`/br/${branchId}`);

    for (const path of [
      `/br/${branchId}/settings`,
      `/br/${branchId}/settings/tables`,
      `/br/${branchId}/settings/pos`,
      `/br/${branchId}/settings/kds`,
      `/br/${branchId}/settings/printers`,
      `/br/${branchId}/menu-limits`,
      `/br/${branchId}/pos-sessions`,
      `/br/${branchId}/stock`,
      `/br/${branchId}/stock/issues`,
      `/br/${branchId}/stock/reports`,
      `/br/${branchId}/stock/transfer`,
      `/br/${branchId}/stock/transfer/new`,
      `/br/${branchId}/stock/count`,
      `/br/${branchId}/stock/count-slips`,
      `/br/${branchId}/stock/waste`,
    ]) {
      await expectHealthyRoute(page, path);
      const operatorNav = page.getByRole("navigation", {
        name: APP_COPY_VI.operatorAriaLabel,
      });
      await expect(operatorNav).toBeVisible();
      await expect(operatorNav.locator('[aria-current="page"]')).toHaveCount(
        expectedOwnerBottomNavCurrentCount(path, branchId),
      );
    }

    await page.goto(`/br/${branchId}/stock/receive`);
    await expect(page).toHaveURL(
      `/br/${branchId}/stock/transfer?queue=receive`,
    );

    expect(health.consoleErrors).toEqual([]);
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
  });

  test("home and shift routes stay inside the branch operator shell on mobile", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(MOBILE);
    const { branchId } = await getCashierProfile();
    const health = watchPageHealth(page);

    for (const path of [
      `/br/${branchId}`,
      `/br/${branchId}/profile`,
      `/br/${branchId}/profile/payslip`,
      `/br/${branchId}/shift/schedule`,
      `/br/${branchId}/shift/schedule/leave`,
      `/br/${branchId}/shift/clock`,
      `/br/${branchId}/shift/checkout-approvals`,
    ]) {
      await expectHealthyRoute(page, path);
      if (path === `/br/${branchId}`) {
        await expect(page.getByText("Cần xử lý")).toBeVisible();
        await expect(page.getByText("Bán hàng")).toBeVisible();
        await expect(page.getByText("Tài chính", { exact: true })).toHaveCount(
          0,
        );
        await expect(page.getByText("Nhân sự", { exact: true })).toHaveCount(0);
        await expect(page.getByText("Lương", { exact: true })).toHaveCount(0);
      }
      const operatorNav = page.getByRole("navigation", {
        name: APP_COPY_VI.operatorAriaLabel,
      });
      await expect(operatorNav).toBeVisible();
      await expect(operatorNav.locator('[aria-current="page"]')).toHaveCount(
        expectedOwnerBottomNavCurrentCount(path, branchId),
      );
    }

    await page.goto(`/br/${branchId}/shift`);
    await expect(page).toHaveURL(`/br/${branchId}/team`);

    expect(health.consoleErrors).toEqual([]);
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
  });

  test("native review queues keep one Branch touch IA across phone and tablet", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { branchId } = await getCashierProfile();
    const health = watchPageHealth(page);
    const paths = [
      `/br/${branchId}/stock/consumption`,
      `/br/${branchId}/stock/count-assignments`,
      `/br/${branchId}/stock/count-slips`,
      `/br/${branchId}/shift/leave-approvals`,
    ];

    for (const viewport of [MOBILE, TABLET_PORTRAIT, TABLET_LANDSCAPE]) {
      await page.setViewportSize(viewport);
      for (const path of paths) {
        await expectHealthyRoute(page, path);
        const operatorNav = page.getByRole("navigation", {
          name: APP_COPY_VI.operatorAriaLabel,
        });
        await expect(operatorNav).toBeVisible();
        await expect(operatorNav.locator('[aria-current="page"]')).toHaveCount(
          expectedOwnerBottomNavCurrentCount(path, branchId),
        );
      }
    }

    expect(health.consoleErrors).toEqual([]);
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
  });

  test("Admin Dashboard count management renders the correct desktop list state", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { branchId } = await getCashierProfile();
    const health = watchPageHealth(page);
    await page.setViewportSize(DESKTOP);

    for (const path of [
      `/inventory/count-assignments?branchId=${branchId}`,
      "/inventory/count-slips",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);
      const table = page.getByRole("table").first();
      if (path.startsWith("/inventory/count-assignments")) {
        await expect(
          table.or(
            page.getByText(INVENTORY_VI.countAssignNoWarehouseTitle, {
              exact: true,
            }),
          ),
        ).toBeVisible();
      } else {
        await expect(table).toBeVisible();
      }
      const overflowX = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      );
      expect(overflowX).toBeLessThanOrEqual(2);
    }

    expect(health.consoleErrors).toEqual([]);
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
  });

  test("Owner keeps the plane picker and cashier cannot enter Admin Dashboard", async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext({
      storageState: E2E_AUTH_STORAGE_OWNER,
    });
    const ownerPage = await ownerContext.newPage();
    await ownerPage.setViewportSize(MOBILE);
    await ownerPage.goto("/", { waitUntil: "domcontentloaded" });
    await expect(ownerPage).toHaveURL("/");
    await expect(
      ownerPage.getByText(APP_COPY_VI.adminDashboard, { exact: true }),
    ).toBeVisible();
    await ownerContext.close();

    const cashierContext = await browser.newContext({
      storageState: E2E_AUTH_STORAGE,
    });
    const cashierPage = await cashierContext.newPage();
    const { branchId } = await getCashierProfile();
    await cashierPage.goto("/orders", { waitUntil: "domcontentloaded" });
    await expect(cashierPage).toHaveURL(`/br/${branchId}`);
    await cashierPage.goto(`/br/${branchId}/orders`, {
      waitUntil: "domcontentloaded",
    });
    await expect(cashierPage).toHaveURL(`/br/${branchId}/orders`);
    await cashierContext.close();
  });

  test("Owner Admin Dashboard switches chrome at the exact lg breakpoint", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      storageState: E2E_AUTH_STORAGE_OWNER,
    });
    const page = await context.newPage();
    const health = watchPageHealth(page);

    for (const viewport of [
      MOBILE,
      TABLET_PORTRAIT,
      TABLET_LANDSCAPE,
      DESKTOP,
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/admin/settings/general", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);

      await expect(page).toHaveURL("/admin/settings/general");
      await expect(page.locator('[data-slot="sidebar-wrapper"]')).toBeVisible();
      await expect(page.locator('a[href^="/br/"]')).toHaveCount(0);

      const overflowX = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      );
      expect(overflowX).toBeLessThanOrEqual(2);

      const bottomNav = page.getByRole("navigation", {
        name: "Điều hướng quản trị",
      });
      const sidebarTrigger = page.locator('[data-slot="sidebar-trigger"]');
      const desktopSidebar = page.locator('[data-slot="sidebar-container"]');

      if (viewport.width < TABLET_LANDSCAPE.width) {
        await expect(bottomNav).toBeVisible();
        await expect(sidebarTrigger).toBeVisible();
        await expect(desktopSidebar).toHaveCount(0);

        if (viewport.width === MOBILE.width) {
          await page.getByRole("button", { name: "Mô-đun" }).click();
          const mobileSidebar = page.locator(
            '[data-slot="sidebar"][data-mobile="true"]',
          );
          await expect(mobileSidebar).toBeVisible();
          await expect(
            mobileSidebar.getByText(APP_COPY_VI.adminDashboard, {
              exact: true,
            }),
          ).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(mobileSidebar).toBeHidden();
        }
      } else {
        await expect(bottomNav).toBeHidden();
        await expect(sidebarTrigger).toBeHidden();
        await expect(desktopSidebar).toBeVisible();
      }
    }

    expect(health.consoleErrors).toEqual([]);
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
    await context.close();
  });
});
