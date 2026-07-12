import { expect, test, type Page } from "@playwright/test";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { getCashierProfile } from "./helpers/supabase";
import {
  E2E_AUTH_STORAGE_MANAGER,
  E2E_AUTH_STORAGE_OWNER,
} from "../playwright.config";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });

const MOBILE = { width: 390, height: 844 };
const TABLET_PORTRAIT = { width: 768, height: 1024 };
const TABLET_LANDSCAPE = { width: 1024, height: 768 };
const DESKTOP = { width: 1440, height: 900 };

const OFFICE_PREFIXES = [
  "/admin",
  "/branch-settings",
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

function watchPageHealth(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: Array<{ status: number; url: string }> = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() !== "error") return;
    if (KNOWN_CONSOLE_NOISE.some((pattern) => pattern.test(text))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(
      `${new URL(page.url()).pathname}: ${error.stack ?? error.message}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push({ status: response.status(), url: response.url() });
    }
  });

  return { consoleErrors, pageErrors, serverErrors };
}

async function expectHealthyRoute(
  page: Page,
  path: string,
  options: { allowWorkspaceLinks?: boolean } = {},
) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);

  const state = await page.evaluate((officePrefixes) => {
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
      officeLinkCount: links.filter((href) =>
        officePrefixes.some((prefix) => href.startsWith(prefix)),
      ).length,
      isLoginSurface: /Đăng nhập|Log in to Vercel|Continue with Email/.test(
        text,
      ),
      isAdminSurface: /Tổng quan quản trị|Điều hướng quản trị/.test(text),
    };
  }, OFFICE_PREFIXES);

  expect(state.pathname).toBe(path);
  expect(state.overflowX).toBeLessThanOrEqual(2);
  if (options.allowWorkspaceLinks) {
    expect(state.officeLinkCount).toBeGreaterThan(0);
  } else {
    expect(state.officeLinkCount).toBe(0);
  }
  expect(state.isLoginSurface).toBe(false);
  expect(state.isAdminSurface).toBe(false);
}

function expectedOwnerBottomNavCurrentCount(path: string, branchId: number) {
  const base = `/br/${branchId}`;
  if (path === base) return 1;
  if (path.startsWith(`${base}/team`)) return 1;
  if (path.startsWith(`${base}/stock`)) return 1;
  if (path.startsWith(`${base}/profile`)) return 1;
  return 0;
}

test.describe("branch route shell ownership", () => {
  test("manager opens its Branch Hub on mobile and desktop", async ({
    browser,
  }) => {
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

    for (const viewport of [MOBILE, DESKTOP]) {
      await page.setViewportSize(viewport);
      await expectHealthyRoute(page, hubPath, { allowWorkspaceLinks: true });
    }

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

  test("dashboard, settings and stock stay inside the branch operator shell on mobile", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(MOBILE);
    const { branchId } = await getCashierProfile();
    const health = watchPageHealth(page);

    for (const path of [
      `/br/${branchId}/dashboard`,
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
    await expect(page).toHaveURL(`/br/${branchId}/stock/receive`);

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
      await expectHealthyRoute(page, path, {
        allowWorkspaceLinks: path === `/br/${branchId}`,
      });
      if (path === `/br/${branchId}`) {
        await expect(page.getByText("Cần xử lý")).toBeVisible();
        await expect(page.getByText("Trạm vận hành")).toBeVisible();
        await expect(page.getByText("Quản lý cửa hàng")).toBeVisible();
        await expect(page.getByText("Tài chính")).toBeVisible();
        await expect(page.getByText("Nhân sự")).toBeVisible();
        await expect(page.getByText("Lương")).toBeVisible();
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

  test("Office count management keeps desktop tables", async ({ page }) => {
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
      await expect(
        page
          .locator("table")
          .first()
          .or(page.getByText("Chưa có kho chi nhánh")),
      ).toBeVisible();
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
});
