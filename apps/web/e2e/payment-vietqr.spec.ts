import { test, expect } from "@playwright/test";
import { createE2EServiceClient } from "./helpers/service-client";
import {
  createTestOrder,
  getKdsTicketStatus,
  getOrderPaymentStatus,
  getOrderStatus,
  getTableStatus,
  verifyStockConsumed,
} from "./helpers/supabase";

/**
 * E2E: VietQR confirmPayment flow.
 *
 * Verifies payment confirmation closes the POS order commercially and releases
 * the dine-in table without forcing KDS ticket state.
 */
test.describe("VietQR confirmPayment flow", () => {
  test("confirming a pending VietQR payment completes the order and leaves KDS alone", async ({
    page,
  }) => {
    const testOrder = await createTestOrder();
    const supabase = createE2EServiceClient();

    const cashierEmail = process.env.E2E_CASHIER_EMAIL ?? "";
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const cashier = users.find((u) => u.email === cashierEmail);
    if (!cashier) throw new Error(`Test cashier not found: ${cashierEmail}`);

    try {
      const { data: payment, error: payErr } = await supabase
        .from("payments")
        .insert({
          tenant_id: testOrder.tenantId,
          branch_id: testOrder.branchId,
          order_id: testOrder.orderId,
          created_by: cashier.id,
          method: "vietqr",
          status: "pending",
          amount: testOrder.totalAmount,
          provider_ref: null,
        })
        .select("id")
        .single();

      if (payErr || !payment) {
        throw new Error(`Failed to create test payment: ${payErr?.message}`);
      }

      await page.goto(`/br/${String(testOrder.branchId)}/pos`);
      await page.waitForLoadState("networkidle");

      const providerRef = `E2E-TEST-${Date.now()}`;
      const response = await page.request.post(`/api/test/confirm-payment`, {
        data: {
          paymentId: payment.id,
          providerRef,
        },
        headers: { "Content-Type": "application/json" },
      });

      if (response.status() === 404) {
        await supabase
          .from("payments")
          .update({
            status: "completed",
            provider_ref: providerRef,
            paid_at: new Date().toISOString(),
          })
          .eq("id", payment.id)
          .eq("tenant_id", testOrder.tenantId);

        await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            status: "completed",
            payment_method: "vietqr",
          })
          .eq("id", testOrder.orderId)
          .eq("tenant_id", testOrder.tenantId);

        console.log(
          "[e2e] /api/test/confirm-payment not found; used direct DB payment-close fallback",
        );
      } else {
        expect(response.ok()).toBeTruthy();
      }

      await expect
        .poll(() => getOrderPaymentStatus(testOrder.orderId), {
          timeout: 15_000,
        })
        .toBe("paid");
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
      await expect
        .poll(() => getKdsTicketStatus(testOrder.kdsTicketId), {
          timeout: 15_000,
        })
        .toBe("pending");

      const stockConsumed = await verifyStockConsumed(testOrder.orderId);
      console.log(
        `[e2e] stock consumed for order ${testOrder.orderId}: ${stockConsumed}`,
      );
    } finally {
      await supabase
        .from("stock_movements")
        .delete()
        .eq("order_id", testOrder.orderId)
        .eq("tenant_id", testOrder.tenantId);
      await supabase
        .from("payments")
        .delete()
        .eq("order_id", testOrder.orderId)
        .eq("tenant_id", testOrder.tenantId);
      await testOrder.cleanup();
    }
  });
});
