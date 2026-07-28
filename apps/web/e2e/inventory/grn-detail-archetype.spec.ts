import { expect, test } from "@playwright/test";
import { E2E_AUTH_STORAGE_OWNER } from "../../playwright.config";

/**
 * Authenticated control_surface smoke for GRN DETAIL/DOC exemplar (Wave E).
 * Skips cleanly when owner storage is stale / credentials unavailable.
 */
test.use({ storageState: E2E_AUTH_STORAGE_OWNER });

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

async function requireOwnerSession(
  page: import("@playwright/test").Page,
  path: string,
) {
  await page.goto(path);
  if (page.url().includes("/login")) {
    test.skip(
      true,
      "GRN archetype smoke needs a live E2E_OWNER session (playwright setup authenticate as test owner).",
    );
  }
}

test.describe("GRN DETAIL archetype (control_surface)", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}: document/history tabs and sticky footer chrome`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await requireOwnerSession(page, "/inventory/grn");

      const rowLink = page.locator('a[href^="/inventory/grn/"]').first();
      await expect(rowLink).toBeVisible({ timeout: 30_000 });
      await rowLink.click();
      await expect(page).toHaveURL(/\/inventory\/grn\/[^/]+/);

      const documentTab = page.getByRole("tab", {
        name: /Phiếu nhập|Tài liệu|Document/i,
      });
      const historyTab = page.getByRole("tab", { name: /Lịch sử/i });
      await expect(documentTab).toBeVisible();
      await expect(historyTab).toBeVisible();

      await historyTab.click();
      await expect(
        page.getByText(/Lịch sử chỉnh sửa|Chưa có lịch sử|Không có/i).first(),
      ).toBeVisible({ timeout: 15_000 });

      await documentTab.click();
      await expect(page.locator("[data-owner-shell-scroll]")).toBeVisible();
    });
  }

  test("DOC create path keeps shell scrollport after supplier context", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await requireOwnerSession(page, "/inventory/grn/new");

    const supplierLink = page.locator('a[href^="/inventory/grn/new/"]').first();
    if (await supplierLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await supplierLink.click();
      await expect(page).toHaveURL(/\/inventory\/grn\/new\/[^/]+/);
    }

    await expect(page.locator("[data-owner-shell-scroll]")).toBeVisible();
  });
});
