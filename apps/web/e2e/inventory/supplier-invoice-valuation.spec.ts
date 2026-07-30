import { expect, test } from "@playwright/test";
import { E2E_AUTH_STORAGE_OWNER } from "../../playwright.config";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });

test.describe("inventory valuation surfaces", () => {
  test("owner can open the canonical cost-close route", async ({ page }) => {
    await page.goto("/finance/cost-close");
    await expect(
      page.getByRole("heading", { name: "Khóa kỳ giá vốn" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Khóa kỳ" }),
    ).toBeVisible();
    await expect(page.getByText(/Mở lại kỳ/i)).toHaveCount(0);
  });

  test("supplier invoice detail keeps settlement in the canonical sheet", async ({
    page,
  }) => {
    await page.goto("/finance/supplier-invoices");
    await expect(
      page.getByRole("heading", {
        name: "Thuế GTGT đầu vào | Thanh toán NCC",
      }),
    ).toBeVisible();
  });
});
