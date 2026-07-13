import { expect, test, type Page } from "@playwright/test";
import { E2E_AUTH_STORAGE_OWNER } from "../playwright.config";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function readResponsiveState(page: Page) {
  return page.evaluate(() => ({
    isMobile: window.matchMedia("(max-width: 767px)").matches,
    overflowX:
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - window.innerWidth,
  }));
}

test("finance reconciliation switches between mobile cards and desktop tables", async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/finance/bank-transactions", {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(/\/finance\/bank-transactions$/);
  await expect(
    page.getByRole("heading", { name: "Đối soát thanh toán" }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("MoMo");
  await expect(page.locator("body")).toContainText("SePay");
  await expect(page.locator("table")).toHaveCount(0);

  const mobileState = await readResponsiveState(page);
  expect(mobileState.isMobile).toBe(true);
  expect(mobileState.overflowX).toBeLessThanOrEqual(2);

  await page.setViewportSize(DESKTOP);
  await expect.poll(() => page.locator("table").count()).toBeGreaterThan(0);
  const desktopState = await readResponsiveState(page);
  expect(desktopState.isMobile).toBe(false);
  expect(desktopState.overflowX).toBeLessThanOrEqual(2);

  await page.setViewportSize(MOBILE);
  await expect(page.locator("table")).toHaveCount(0);
  const restoredMobileState = await readResponsiveState(page);
  expect(restoredMobileState.isMobile).toBe(true);
  expect(restoredMobileState.overflowX).toBeLessThanOrEqual(2);
});
