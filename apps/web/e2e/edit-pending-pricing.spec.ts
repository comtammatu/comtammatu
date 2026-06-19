import { test, expect } from "@playwright/test";
import {
  createTestOrder,
  getOrderDiscountAmount,
  getOrderItemSubtotal,
  getOrderTotal,
  setOrderDiscountPercent,
} from "./helpers/supabase";

/**
 * E2E: edit_pending_order_item recomputes pricing server-side.
 *
 * Regression boundary (commit 1de4a2a, migration
 * 20260518000000_fix_edit_pending_order_item_pricing.sql):
 *   - Server MUST recompute order_items.subtotal from canonical menu price
 *     × quantity, not trust client p_unit_price.
 *   - Server MUST recompute orders.discount_amount via compute_discount_amount
 *     when subtotal changes (percentage discount must scale with new subtotal).
 *   - kds_tickets.updated_at MUST bump.
 *
 * Scope of THIS spec: quantity-only edit on a pending item with a 10%
 * percentage discount applied. Asserts that subtotal AND discount_amount
 * recompute correctly. Modifier/variant/side coverage is intentionally
 * deferred — those depend on menu_item_modifiers / menu_item_variants
 * fixture data which is environment-specific. The qty+discount path
 * exercises the same recompute code path that the original bug touched.
 */
test.describe("Edit pending order item — pricing recompute", () => {
  test("changing quantity recomputes subtotal AND percentage discount", async ({
    page,
  }) => {
    const testOrder = await createTestOrder();

    try {
      // Apply 10% discount on baseline subtotal (1 × unitPrice).
      await setOrderDiscountPercent(testOrder.orderId, 10);

      const baselineSubtotal = await getOrderItemSubtotal(
        // Helper exposes the order_item id only via internal lookup; pull
        // from the order directly via service role.
        await resolveOrderItemId(testOrder.orderId),
      );
      expect(baselineSubtotal).toBe(testOrder.totalAmount);

      const baselineDiscount = await getOrderDiscountAmount(testOrder.orderId);
      expect(baselineDiscount).toBe(Math.floor(testOrder.totalAmount * 0.1));

      await page.goto(`/br/${String(testOrder.branchId)}/pos`);
      await page.waitForLoadState("networkidle");
      await page.getByTestId("pos-active-orders-tab").click();

      const orderCard = page.getByTestId(
        `pos-order-card-${String(testOrder.orderId)}`,
      );
      await expect(orderCard).toBeVisible({ timeout: 10_000 });
      await orderCard.click();

      // Open the item-level actions sheet, then "Sửa món".
      const itemRow = page
        .locator('[data-testid^="pos-order-item-row-"]')
        .first();
      await expect(itemRow).toBeVisible({ timeout: 5_000 });
      await itemRow.click();

      const editButton = page.getByRole("button", { name: "Sửa món" });
      await expect(editButton).toBeVisible({ timeout: 5_000 });
      await editButton.click();

      // ItemCustomizer is now open. Bump quantity from 1 → 3 via the
      // "+" buttons (size-11 after POS-MOBILE-BUTTON-TOUCH-TARGET fix).
      const incButton = page.getByRole("button", { name: "Tăng số lượng" });
      await expect(incButton).toBeVisible({ timeout: 5_000 });
      await incButton.click();
      await incButton.click();

      const confirmButton = page.getByRole("button", {
        name: /Cập nhật|Cập nhật món đã gửi/,
      });
      await expect(confirmButton).toBeEnabled({ timeout: 5_000 });
      await confirmButton.click();

      // Server-side recompute MUST reflect 3 × unitPrice and 10% discount.
      const expectedSubtotal = testOrder.totalAmount * 3;
      const expectedDiscount = Math.floor(expectedSubtotal * 0.1);
      const expectedTotal = expectedSubtotal - expectedDiscount;

      await expect
        .poll(
          async () =>
            getOrderItemSubtotal(await resolveOrderItemId(testOrder.orderId)),
          {
            timeout: 15_000,
            message: "subtotal must recompute to qty × unit_price server-side",
          },
        )
        .toBe(expectedSubtotal);

      await expect
        .poll(() => getOrderDiscountAmount(testOrder.orderId), {
          timeout: 15_000,
          message:
            "percentage discount must rescale to new subtotal (compute_discount_amount)",
        })
        .toBe(expectedDiscount);

      await expect
        .poll(() => getOrderTotal(testOrder.orderId), {
          timeout: 15_000,
          message: "total_amount must reflect recomputed subtotal − discount",
        })
        .toBe(expectedTotal);
    } finally {
      await testOrder.cleanup();
    }
  });
});

async function resolveOrderItemId(orderId: number): Promise<number> {
  // Inline lookup avoids an extra exported helper for a one-off spec need.
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE env vars for order_item lookup");
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .neq("status", "cancelled")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to resolve order_item for order ${orderId}: ${error?.message}`,
    );
  }
  return data.id;
}
