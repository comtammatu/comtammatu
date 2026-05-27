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
  setKdsTestOrderPriority,
  type TestKdsTicket,
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
  test("oldest active kitchen order appears first in focus and grid modes", async ({
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
        page.getByTestId(`kds-focus-card-${String(older.orderId)}`),
      ).toBeVisible({ timeout: 10_000 });

      await page.goto(`/br/${String(newer.branchId)}/kds?view=comprehensive`);
      await page.waitForLoadState("networkidle");
      await expect(
        page
          .getByTestId("kds-column-takeaway")
          .locator('[data-testid^="kds-heatmap-card-"]')
          .first(),
      ).toHaveAttribute(
        "data-testid",
        `kds-heatmap-card-${String(older.orderId)}`,
      );
    } finally {
      await Promise.all([newer.cleanup(), older.cleanup()]);
    }
  });

  test("preparing order stays current before priority pending orders", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const baseTime = Date.now() + 259_200_000;
    const working = await createKdsTestTicket({
      createdAt: new Date(baseTime).toISOString(),
      orderNumberPrefix: "KDS-WORKING",
      status: "preparing",
    });
    const priority = await createKdsTestTicket({
      createdAt: new Date(baseTime + 60_000).toISOString(),
      isPriority: true,
      orderNumberPrefix: "KDS-PRIORITY",
      status: "pending",
    });

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(working.branchId)}/kds?view=comprehensive`);
      await page.waitForLoadState("networkidle");

      await expect(
        page
          .getByTestId("kds-column-takeaway")
          .locator('[data-testid^="kds-heatmap-card-"]')
          .first(),
      ).toHaveAttribute(
        "data-testid",
        `kds-heatmap-card-${String(working.orderId)}`,
        { timeout: 10_000 },
      );
      await expect(
        page
          .getByTestId("kds-column-takeaway")
          .locator('[data-testid^="kds-heatmap-card-"]')
          .nth(1),
      ).toHaveAttribute(
        "data-testid",
        `kds-heatmap-card-${String(priority.orderId)}`,
      );
    } finally {
      await Promise.all([priority.cleanup(), working.cleanup()]);
    }
  });

  test("priority pending order becomes next without replacing current pending order", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const baseTime = Date.now() + 345_600_000;
    const current = await createKdsTestTicket({
      createdAt: new Date(baseTime).toISOString(),
      orderNumberPrefix: "KDS-CURRENT-PENDING",
      status: "pending",
    });
    const normalNext = await createKdsTestTicket({
      createdAt: new Date(baseTime + 60_000).toISOString(),
      orderNumberPrefix: "KDS-NORMAL-NEXT",
      status: "pending",
    });
    const priorityNext = await createKdsTestTicket({
      createdAt: new Date(baseTime + 120_000).toISOString(),
      orderNumberPrefix: "KDS-PRIORITY-NEXT",
      status: "pending",
    });

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(current.branchId)}/kds`);
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByTestId(`kds-focus-card-${String(current.orderId)}`),
      ).toBeVisible({ timeout: 10_000 });

      await setKdsTestOrderPriority(priorityNext.orderId, true);

      await expect(
        page.getByTestId(`kds-focus-card-${String(current.orderId)}`),
      ).toBeVisible({ timeout: 10_000 });

      await page.goto(`/br/${String(current.branchId)}/kds?view=comprehensive`);
      await page.waitForLoadState("networkidle");
      await expect(
        page
          .getByTestId("kds-column-takeaway")
          .locator('[data-testid^="kds-heatmap-card-"]')
          .first(),
      ).toHaveAttribute(
        "data-testid",
        `kds-heatmap-card-${String(priorityNext.orderId)}`,
        { timeout: 10_000 },
      );
    } finally {
      await Promise.all([
        priorityNext.cleanup(),
        normalNext.cleanup(),
        current.cleanup(),
      ]);
    }
  });

  test("comprehensive view keeps every active backlog order rendered and reachable", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const baseTime = Date.now() + 432_000_000;
    const fixtures: TestKdsTicket[] = [];

    try {
      for (let index = 0; index < 40; index++) {
        fixtures.push(
          await createKdsTestTicket({
            createdAt: new Date(baseTime + index * 60_000).toISOString(),
            orderNumberPrefix: `KDS-BACKLOG-${String(index + 1).padStart(2, "0")}`,
            status: "pending",
          }),
        );
      }

      const firstFixture = fixtures[0]!;
      const lastFixture = fixtures.at(-1)!;

      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(
        `/br/${String(firstFixture.branchId)}/kds?view=comprehensive`,
      );
      await page.waitForLoadState("networkidle");

      await expect(
        page
          .getByTestId("kds-column-takeaway")
          .locator('[data-testid^="kds-heatmap-card-"]')
          .first(),
      ).toHaveAttribute(
        "data-testid",
        `kds-heatmap-card-${String(firstFixture.orderId)}`,
        { timeout: 15_000 },
      );

      for (const fixture of fixtures) {
        await expect(
          page.locator(
            `[data-testid="kds-order-card-${String(fixture.orderId)}"], [data-testid="kds-heatmap-card-${String(fixture.orderId)}"]`,
          ),
        ).toHaveCount(1);
        await expect(
          page.locator(
            `[data-testid="kds-order-item-${String(fixture.orderItemId)}"], [data-testid="kds-heatmap-item-${String(fixture.orderItemId)}"]`,
          ),
        ).toHaveCount(1);
      }

      const lastCard = page.getByTestId(
        `kds-heatmap-card-${String(lastFixture.orderId)}`,
      );
      await lastCard.scrollIntoViewIfNeeded();
      await expect(lastCard).toBeVisible();
    } finally {
      await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
    }
  });

  test("default queue hides ready-only cards even with stale status URLs", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const pending = await createKdsTestTicket({
      orderNumberPrefix: "KDS-ACTIVE",
      status: "pending",
    });
    const ready = await createKdsTestTicket({
      orderNumberPrefix: "KDS-READY",
      status: "ready",
    });

    try {
      await loginAsChef(page, chef.email, chef.password!);

      await page.goto(`/br/${String(pending.branchId)}/kds?view=comprehensive`);
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByTestId(`kds-heatmap-card-${String(pending.orderId)}`),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByTestId(`kds-heatmap-card-${String(ready.orderId)}`),
      ).toHaveCount(0);

      await page.goto(
        `/br/${String(pending.branchId)}/kds?view=comprehensive&status=all`,
      );
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByTestId(`kds-heatmap-card-${String(pending.orderId)}`),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByTestId(`kds-heatmap-card-${String(ready.orderId)}`),
      ).toHaveCount(0);
    } finally {
      await Promise.all([pending.cleanup(), ready.cleanup()]);
    }
  });

  test("chef complete action completes all active tickets on the card", async ({
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

  test("chef can complete a pending ticket without accepting it first", async ({
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
      await expect(itemRow).toBeVisible();
      await expect(
        page.getByTestId(`kds-complete-ticket-${String(fixture.ticketId)}`),
      ).toBeVisible();

      await page
        .getByTestId(`kds-complete-ticket-${String(fixture.ticketId)}`)
        .click();
      await expect
        .poll(() => getKdsTicketStatus(fixture.ticketId), {
          timeout: 10_000,
        })
        .toBe("ready");
      await expect(orderCard).toBeHidden({ timeout: 10_000 });
    } finally {
      await fixture.cleanup();
    }
  });

  test("chef can complete a later card item while sibling items stay active", async ({
    page,
  }) => {
    const chef = await resolveChefCredentials();

    test.skip(
      !chef.password,
      "Missing E2E_CHEF_PASSWORD or fallback cashier password",
    );

    const blocker = await createKdsTestTicket({
      orderNumberPrefix: "KDS-CURRENT",
      status: "preparing",
    });
    const fixture = await createKdsTestOrderWithTickets(["pending", "pending"]);
    const activeTicketId = fixture.ticketIds[0]!;
    const readyTicketId = fixture.ticketIds[1]!;
    const readyItemId = fixture.orderItemIds[1]!;

    try {
      await loginAsChef(page, chef.email, chef.password!);
      await page.goto(`/br/${String(fixture.branchId)}/kds?view=comprehensive`);
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByTestId(`kds-heatmap-card-${String(blocker.orderId)}`),
      ).toBeVisible({ timeout: 10_000 });

      const heatmapCard = page.getByTestId(
        `kds-heatmap-card-${String(fixture.orderId)}`,
      );
      await expect(heatmapCard).toBeVisible({ timeout: 10_000 });
      await expect(
        heatmapCard.getByTestId(
          `kds-complete-order-${String(fixture.orderId)}`,
        ),
      ).toBeVisible();

      await heatmapCard
        .getByTestId(`kds-heatmap-complete-ticket-${String(readyTicketId)}`)
        .click();

      await expect
        .poll(() => getKdsTicketStatuses(fixture.ticketIds), {
          timeout: 10_000,
        })
        .toEqual({
          [activeTicketId]: "pending",
          [readyTicketId]: "ready",
        });
      await expect
        .poll(() => getOrderStatus(fixture.orderId))
        .not.toBe("ready");
      await expect
        .poll(() => getOrderPaymentStatus(fixture.orderId))
        .toBe("unpaid");
      await expect.poll(() => getTableStatus(fixture.tableId)).toBe("occupied");

      await page.reload();
      await page.waitForLoadState("networkidle");

      await expect(heatmapCard).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByTestId(`kds-heatmap-item-${String(readyItemId)}`),
      ).toHaveClass(/bg-success\/10/, { timeout: 10_000 });
    } finally {
      await Promise.all([fixture.cleanup(), blocker.cleanup()]);
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
        page.getByTestId(`kds-heatmap-item-${String(fixture.orderItemId)}`),
      ).toContainText(fixture.itemName, { timeout: 10_000 });

      const appended = await addOrderItemToTestOrder({
        orderId: fixture.orderId,
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
      });

      await expect(
        page.getByTestId(`kds-heatmap-item-${String(appended.orderItemId)}`),
      ).toContainText(`${fixture.itemName} (2)`, { timeout: 10_000 });
      await expect(
        page.getByText(`Món #${String(appended.orderItemId)}`),
      ).toHaveCount(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
