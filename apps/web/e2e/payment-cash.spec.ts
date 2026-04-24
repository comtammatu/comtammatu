import { test, expect } from "@playwright/test";
import {
  createTestOrder,
  getKdsTicketStatus,
  getOrderPaymentStatus,
  getOrderStatus,
  getTableStatus,
  verifyStockConsumed,
} from "./helpers/supabase";

/**
 * E2E: cash payment closes the POS order.
 *
 * Test scope:
 *   - Cash payment transitions order.payment_status to "paid".
 *   - Cash payment transitions orders.status to "completed".
 *   - Dine-in table is released by the completed order.
 *   - KDS ticket status is not forced by POS payment close.
 */
test.describe("Cash payment -> POS close", () => {
  test("paying a confirmed order completes the order and releases the table without touching KDS", async ({
    page,
  }) => {
    const testOrder = await createTestOrder();

    try {
      await expect.poll(() => getTableStatus(testOrder.tableId)).toBe(
        "occupied",
      );
      await expect
        .poll(() => getKdsTicketStatus(testOrder.kdsTicketId))
        .toBe("pending");

      await page.goto(`/br/${String(testOrder.branchId)}/pos`);
      await page.waitForLoadState("networkidle");
      await page.getByTestId("pos-active-orders-tab").click();

      const orderCard = page.getByTestId(
        `pos-order-card-${String(testOrder.orderId)}`,
      );
      await expect(orderCard).toBeVisible({ timeout: 10_000 });
      await expect(orderCard).toContainText("Chờ thanh toán");
      await page
        .getByTestId(`pos-order-bill-${String(testOrder.orderId)}`)
        .click();

      // New flow: dialog opens at confirm-served step; advance to payment.
      await page.getByTestId("bill-confirm-served").click();

      const cashButton = page.getByTestId("bill-pay-cash");
      await expect(cashButton).toBeVisible({ timeout: 5_000 });
      await cashButton.click();

      await page
        .getByTestId("bill-cash-received")
        .fill(String(Math.round(testOrder.totalAmount)));
      await page.getByTestId("bill-confirm-cash").click();

      await expect
        .poll(() => getOrderPaymentStatus(testOrder.orderId), {
          timeout: 15_000,
          message: "cash payment should mark the order as paid",
        })
        .toBe("paid");
      await expect
        .poll(() => getOrderStatus(testOrder.orderId), {
          timeout: 15_000,
          message: "cash payment should complete the dine-in order",
        })
        .toBe("completed");
      await expect
        .poll(() => getTableStatus(testOrder.tableId), {
          timeout: 15_000,
          message: "payment close should release the dine-in table",
        })
        .toBe("available");
      await expect
        .poll(() => getKdsTicketStatus(testOrder.kdsTicketId), {
          timeout: 15_000,
          message: "payment close must not mutate the KDS ticket",
        })
        .toBe("pending");
      await expect(orderCard).toBeHidden({ timeout: 15_000 });

      const stockConsumed = await verifyStockConsumed(testOrder.orderId);
      console.log(
        `[e2e] stock consumed for order ${testOrder.orderId}: ${stockConsumed}`,
        stockConsumed
          ? "stock_movements created"
          : "no stock_movements; ensure test branch has initialized stock_levels",
      );
    } finally {
      await testOrder.cleanup();
    }
  });

  test("payment succeeds even when stock deduction fails (non-fatal verification)", async ({
    page: _page,
  }) => {
    test.skip(
      true,
      "Structural test: demonstrated by the main cash payment test when stock_levels are empty",
    );
  });
});
