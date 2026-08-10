import { expect, test } from "@playwright/test";
import { E2E_AUTH_STORAGE_OWNER } from "../../playwright.config";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });

test.describe("inventory valuation surfaces", () => {
  test("supplier invoice detail keeps settlement in the canonical sheet", async ({
    page,
  }) => {
    await page.goto("/finance/supplier-invoices");
    await expect(
      page.getByRole("heading", {
        name: "HĐ đầu vào",
      }),
    ).toBeVisible();
  });
});
