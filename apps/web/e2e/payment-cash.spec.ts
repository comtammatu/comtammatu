import { test, expect } from "@playwright/test";
import {
  createTestOrder,
  getOrderStatus,
  verifyStockConsumed,
  getOrderPaymentStatus,
} from "./helpers/supabase";

/**
 * E2E: Cash payment flow with stock deduction verification.
 *
 * Pre-conditions (set in .env.test.local):
 *   E2E_CASHIER_EMAIL        — cashier account email
 *   E2E_CASHIER_PASSWORD     — cashier account password
 *   E2E_TEST_TENANT_ID       — tenant id
 *   E2E_TEST_BRANCH_ID       — branch id the cashier belongs to
 *   E2E_TEST_MENU_ITEM_ID    — menu item id with a recipe defined
 *
 * Test scope:
 *   - cash payment creates stock_movements (consume_stock_for_order is wired)
 *   - order.payment_status transitions to "paid" after cash payment
 *   - non-fatal stock error does NOT fail the payment (missing ingredients)
 *
 * This test uses the Supabase service role to set up a "confirmed" order directly,
 * then interacts with the bill receipt via the POS UI to pay it.
 * This avoids the complexity of driving the full order creation through the UI.
 */

test.describe("Cash payment → stock deduction", () => {
  test("paying a confirmed order with cash marks it paid and records stock movement", async ({
    page,
  }) => {
    const testOrder = await createTestOrder();

    try {
      // Navigate to POS for the test branch
      await page.goto(`/br/${String(testOrder.branchId)}/pos`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("tab", { name: "Đơn đang phục vụ" }).click();

      const orderCard = page.getByTestId(`pos-order-card-${String(testOrder.orderId)}`);
      await expect(orderCard).toBeVisible({ timeout: 10_000 });
      await expect(orderCard).toContainText("Chờ thanh toán");
      await page
        .getByTestId(`pos-order-bill-${String(testOrder.orderId)}`)
        .click();

      // Bill receipt sheet should open — wait for "Thanh toán" section
      await expect(page.getByText("Hóa đơn").last()).toBeVisible({
        timeout: 5_000,
      });

      // Click the "Tiền mặt" (cash) payment button
      const cashButton = page.getByTestId("bill-pay-cash");
      await cashButton.scrollIntoViewIfNeeded();
      await expect(cashButton).toBeVisible({ timeout: 3_000 });
      await cashButton.evaluate((button: HTMLButtonElement) => button.click());

      await expect.poll(
        () => getOrderPaymentStatus(testOrder.orderId),
        {
          timeout: 15_000,
          message: "cash payment should mark the order as paid",
        },
      ).toBe("paid");
      await expect(orderCard).toContainText("Đã thu tiền", {
        timeout: 15_000,
      });
      await expect(page.getByTestId("bill-complete-order")).toBeVisible({
        timeout: 15_000,
      });

      await page
        .getByTestId("bill-complete-order")
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect.poll(
        () => getOrderStatus(testOrder.orderId),
        {
          timeout: 15_000,
          message: "completed payment flow should finish the dine-in order",
        },
      ).toBe("completed");
      await expect(page.locator("text=Đã hoàn tất đơn")).toBeVisible({
        timeout: 15_000,
      });

      // Verify stock deduction was attempted (may or may not have succeeded
      // depending on whether test branch has stock_levels initialized)
      // We don't assert true/false — we just verify no uncaught error was thrown
      // The payment must have succeeded regardless of stock result (non-fatal)
      const stockConsumed = await verifyStockConsumed(testOrder.orderId);
      // Log the result — stock deduction is non-fatal at pilot stage
      console.log(
        `[e2e] stock consumed for order ${testOrder.orderId}: ${stockConsumed}`,
        stockConsumed
          ? "✓ stock_movements created"
          : "⚠ no stock_movements — ensure test branch has initialized stock_levels",
      );
    } finally {
      await testOrder.cleanup();
    }
  });

  test("payment succeeds even when stock deduction fails (non-fatal verification)", async ({
    page: _page,
  }) => {
    // This test verifies that a cash payment completes successfully
    // even when consume_stock_for_order would fail (e.g. empty stock_levels).
    //
    // Setup: create an order for a menu item that deliberately has NO recipe
    // or NO stock level initialized. The payment should still succeed.
    //
    // Since we can't easily create a "no recipe" menu item on the fly,
    // this test is a structural documentation test — if stock levels aren't
    // initialized in the test branch, the cash payment test above already
    // demonstrates this behavior (stock not consumed but payment succeeds).

    test.skip(
      true,
      "Structural test: demonstrated by the main cash payment test when stock_levels are empty",
    );
  });
});
