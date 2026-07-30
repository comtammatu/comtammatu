import { expect, test } from "@playwright/test";
import { E2E_AUTH_STORAGE_OWNER } from "../playwright.config";

test.use({ storageState: E2E_AUTH_STORAGE_OWNER });

test("control surface navigation keeps the same sidebar document", async ({
  page,
}) => {
  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") {
      documentRequests.push(request.url());
    }
  });

  await page.goto("/");
  const sidebar = page.locator('[data-slot="sidebar-inner"]');
  await expect(sidebar).toBeVisible();
  await sidebar.evaluate((element) => {
    element.setAttribute("data-shell-sentinel", "persistent");
  });
  documentRequests.length = 0;

  for (const href of ["/inventory", "/finance", "/hr"]) {
    await sidebar.locator(`a[href="${href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${href}(?:\\?.*)?$`));
    await expect(sidebar).toHaveAttribute("data-shell-sentinel", "persistent");
  }

  expect(documentRequests).toEqual([]);
});
