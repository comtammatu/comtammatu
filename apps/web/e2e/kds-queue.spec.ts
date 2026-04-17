import { test, expect, type Page } from "@playwright/test";
import {
  createKdsTestTicket,
  getKdsTicketStatus,
  resolveChefCredentials,
} from "./helpers/supabase";

test.use({ storageState: { cookies: [], origins: [] } });

async function loginAsChef(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });
}

test.describe("KDS bump / recall workflow", () => {
  test("chef can bump a ticket to ready and recall it back", async ({
    page,
  }) => {
    const fixture = await createKdsTestTicket();
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(fixture.branchId)}/kds`);
      await page.waitForLoadState("networkidle");

      const orderCard = page.getByTestId(`kds-order-card-${String(fixture.orderId)}`);
      const itemRow = page.getByTestId(
        `kds-order-item-${String(fixture.orderItemId)}`,
      );

      await expect(orderCard).toBeVisible({ timeout: 10_000 });
      await expect(itemRow).toContainText("Chờ");

      await page.getByTestId(`kds-bump-${String(fixture.ticketId)}`).click();
      await expect(itemRow).toContainText("Đang làm");
      await expect
        .poll(() => getKdsTicketStatus(fixture.ticketId), {
          timeout: 10_000,
        })
        .toBe("preparing");

      await page.getByTestId(`kds-bump-${String(fixture.ticketId)}`).click();
      await expect(itemRow).toContainText("Xong");
      await expect
        .poll(() => getKdsTicketStatus(fixture.ticketId), {
          timeout: 10_000,
        })
        .toBe("ready");

      await page.getByTestId(`kds-recall-${String(fixture.ticketId)}`).click();
      await expect(itemRow).toContainText("Đang làm");
      await expect
        .poll(() => getKdsTicketStatus(fixture.ticketId), {
          timeout: 10_000,
        })
        .toBe("preparing");

      await page.getByTestId(`kds-recall-${String(fixture.ticketId)}`).click();
      await expect(itemRow).toContainText("Chờ");
      await expect
        .poll(() => getKdsTicketStatus(fixture.ticketId), {
          timeout: 10_000,
        })
        .toBe("pending");
    } finally {
      await fixture.cleanup();
    }
  });
});
