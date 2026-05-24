import { test, expect, type Page } from "@playwright/test";
import {
  addOrderItemToTestOrder,
  createKdsTestOrderWithTickets,
  createKdsTestTicket,
  getKdsTicketStatuses,
  getKdsTicketStatus,
  getOrderPaymentStatus,
  getOrderStatus,
  getTableStatus,
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
  test("newest active kitchen order appears first in focus and grid modes", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const baseTime = Date.now() + 172_800_000;
    const older = await createKdsTestTicket({
      createdAt: new Date(baseTime).toISOString(),
      orderNumberPrefix: "KDS-OLDER",
    });
    const newer = await createKdsTestTicket({
      createdAt: new Date(baseTime + 60_000).toISOString(),
      orderNumberPrefix: "KDS-NEWER",
    });

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(newer.branchId)}/kds`);
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByTestId(`kds-focus-card-${String(newer.orderId)}`),
      ).toBeVisible({ timeout: 10_000 });

      await page.goto(`/br/${String(newer.branchId)}/kds?view=comprehensive`);
      await page.waitForLoadState("networkidle");
      await expect(
        page.locator('[data-testid^="kds-order-card-"]').first(),
      ).toHaveAttribute(
        "data-testid",
        `kds-order-card-${String(newer.orderId)}`,
      );
    } finally {
      await Promise.all([newer.cleanup(), older.cleanup()]);
    }
  });

  test("chef can complete every active ticket in the visible kitchen card", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const fixture = await createKdsTestOrderWithTickets([
      "pending",
      "preparing",
      "ready",
      "cancelled",
    ]);

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(fixture.branchId)}/kds`);
      await page.waitForLoadState("networkidle");

      await page
        .getByTestId(`kds-focus-complete-order-${String(fixture.orderId)}`)
        .click();

      await expect
        .poll(async () => getKdsTicketStatuses(fixture.ticketIds), {
          timeout: 10_000,
        })
        .toEqual({
          [fixture.ticketIds[0]!]: "ready",
          [fixture.ticketIds[1]!]: "ready",
          [fixture.ticketIds[2]!]: "ready",
          [fixture.ticketIds[3]!]: "cancelled",
        });
      await expect.poll(() => getOrderStatus(fixture.orderId)).toBe("ready");
      await expect
        .poll(() => getOrderPaymentStatus(fixture.orderId))
        .toBe("unpaid");
      await expect.poll(() => getTableStatus(fixture.tableId)).toBe("occupied");
    } finally {
      await fixture.cleanup();
    }
  });

  test("chef can bump a ticket to ready and recall it back", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const fixture = await createKdsTestTicket();

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(fixture.branchId)}/kds`);
      await page.waitForLoadState("networkidle");

      const orderCard = page.getByTestId(
        `kds-focus-card-${String(fixture.orderId)}`,
      );
      const itemRow = page.getByTestId(
        `kds-focus-item-${String(fixture.orderItemId)}`,
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

  test("new ticket on an already visible order hydrates the dish name", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const fixture = await createKdsTestTicket();

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(fixture.branchId)}/kds`);
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByTestId(`kds-focus-item-${String(fixture.orderItemId)}`),
      ).toContainText(fixture.itemName, { timeout: 10_000 });

      const appended = await addOrderItemToTestOrder({
        orderId: fixture.orderId,
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
      });

      await expect(
        page.getByTestId(`kds-focus-item-${String(appended.orderItemId)}`),
      ).toContainText(`${fixture.itemName} (2)`, { timeout: 10_000 });
      await expect(
        page.getByText(`Món #${String(appended.orderItemId)}`),
      ).toHaveCount(0);
    } finally {
      await fixture.cleanup();
    }
  });

  test("new ticket on an already visible grid card hydrates the dish name", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const fixture = await createKdsTestTicket();

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(fixture.branchId)}/kds?view=comprehensive`);
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByTestId(`kds-order-item-${String(fixture.orderItemId)}`),
      ).toContainText(fixture.itemName, { timeout: 10_000 });

      const appended = await addOrderItemToTestOrder({
        orderId: fixture.orderId,
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
      });

      await expect(
        page.getByTestId(`kds-order-item-${String(appended.orderItemId)}`),
      ).toContainText(`${fixture.itemName} (2)`, { timeout: 10_000 });
      await expect(
        page.getByText(`Món #${String(appended.orderItemId)}`),
      ).toHaveCount(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
