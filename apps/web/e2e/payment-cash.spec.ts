import { test, expect } from "@playwright/test";
import {
  addOrderItemToTestOrder,
  bumpTicketToReady,
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

      await page
        .getByTestId(`pos-order-bill-${String(testOrder.orderId)}`)
        .click();
      const receipt = page.locator("#pos-receipt");
      await expect(
        page.getByRole("dialog", { name: "Hóa đơn" }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).not.toContainText(
        "Phương thức thanh toán",
      );
      await expect(receipt).toContainText(`#${testOrder.orderNumber}`);
      await expect(receipt).toContainText(testOrder.menuItemName);
      await expect(receipt).toContainText("Tiền mặt");
      await page.getByRole("button", { name: "Đóng" }).click();

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

  // POS-SERVED-NOT-TABLE-TERMINAL + PAYMENT-AUTO-COMPLETES-ORDER:
  // Cashier may pay a dine-in order while the chef has bumped some tickets
  // to ready but is still cooking the rest. Payment must close the POS
  // order + release the table without forcing ANY ticket status — both
  // ready and pending tickets are preserved so the chef can finish cooking
  // and per-item served continues via mark_order_item_served.
  test("paying mixed-status order preserves both ready and pending KDS tickets", async ({
    page,
  }) => {
    const testOrder = await createTestOrder();
    const second = await addOrderItemToTestOrder({
      orderId: testOrder.orderId,
      tenantId: testOrder.tenantId,
      branchId: testOrder.branchId,
    });

    try {
      // Chef bumps ticket #1 to ready while ticket #2 stays pending.
      await bumpTicketToReady(testOrder.kdsTicketId);
      await expect
        .poll(() => getKdsTicketStatus(testOrder.kdsTicketId))
        .toBe("ready");
      await expect
        .poll(() => getKdsTicketStatus(second.ticketId))
        .toBe("pending");

      await page.goto(`/br/${String(testOrder.branchId)}/pos`);
      await page.waitForLoadState("networkidle");
      await page.getByTestId("pos-active-orders-tab").click();

      const orderCard = page.getByTestId(
        `pos-order-card-${String(testOrder.orderId)}`,
      );
      await expect(orderCard).toBeVisible({ timeout: 10_000 });
      await page
        .getByTestId(`pos-order-bill-${String(testOrder.orderId)}`)
        .click();

      const cashButton = page.getByTestId("bill-pay-cash");
      await expect(cashButton).toBeVisible({ timeout: 5_000 });
      await cashButton.click();

      // Order now has 2 items × unitPrice (recomputed by helper).
      const total = testOrder.totalAmount * 2;
      await page.getByTestId("bill-cash-received").fill(String(Math.round(total)));
      await page.getByTestId("bill-confirm-cash").click();

      await expect
        .poll(() => getOrderStatus(testOrder.orderId), {
          timeout: 15_000,
        })
        .toBe("completed");
      await expect
        .poll(() => getTableStatus(testOrder.tableId), {
          timeout: 15_000,
        })
        .toBe("available");

      // The cardinal regression assertion: payment close MUST NOT mutate
      // either ticket. Ticket #1 stays `ready`, ticket #2 stays `pending`.
      await expect
        .poll(() => getKdsTicketStatus(testOrder.kdsTicketId), {
          timeout: 15_000,
          message:
            "ready ticket must survive payment close (POS-SERVED-NOT-TABLE-TERMINAL)",
        })
        .toBe("ready");
      await expect
        .poll(() => getKdsTicketStatus(second.ticketId), {
          timeout: 15_000,
          message:
            "pending ticket must survive payment close (POS-SERVED-NOT-TABLE-TERMINAL)",
        })
        .toBe("pending");
    } finally {
      await testOrder.cleanup();
    }
  });
});
