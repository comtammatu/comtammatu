import { createClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";

/**
 * Service-role Supabase client for test setup / teardown.
 * Only used in e2e helpers — never in test specs directly.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the test environment.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for E2E tests",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestOrder {
  orderId: number;
  paymentId?: number;
  cleanup: () => Promise<void>;
}

/**
 * Create a minimal order with one item, linked to an existing menu item.
 * Returns orderId and a cleanup function to delete all created rows.
 *
 * Requires:
 *   E2E_TEST_TENANT_ID   — tenant id (number)
 *   E2E_TEST_BRANCH_ID   — branch id (number)
 *   E2E_TEST_MENU_ITEM_ID — menu item id that has a recipe defined
 */
export async function createTestOrder(): Promise<TestOrder> {
  const supabase = createServiceClient();
  const tenantId = Number(process.env.E2E_TEST_TENANT_ID);
  const branchId = Number(process.env.E2E_TEST_BRANCH_ID);
  const menuItemId = Number(process.env.E2E_TEST_MENU_ITEM_ID);
  const cashierEmail = process.env.E2E_CASHIER_EMAIL;

  if (!tenantId || !branchId || !menuItemId || !cashierEmail) {
    throw new Error(
      "E2E_TEST_TENANT_ID, E2E_TEST_BRANCH_ID, E2E_TEST_MENU_ITEM_ID, E2E_CASHIER_EMAIL must be set",
    );
  }

  // Look up the test cashier's user ID (needed for created_by FK)
  const {
    data: { users },
    error: userErr,
  } = await supabase.auth.admin.listUsers();
  if (userErr) throw new Error(`Failed to list users: ${userErr.message}`);
  const cashier = users.find((u) => u.email === cashierEmail);
  if (!cashier) throw new Error(`Test cashier not found: ${cashierEmail}`);
  const createdBy = cashier.id;

  // Create order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      created_by: createdBy,
      order_number: `E2E-${Date.now()}`,
      status: "confirmed",
      payment_status: "unpaid",
      order_type: "dine_in",
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    throw new Error(`Failed to create test order: ${orderErr?.message}`);
  }

  // Create order item
  const { error: itemErr } = await supabase.from("order_items").insert({
    tenant_id: tenantId,
    order_id: order.id,
    menu_item_id: menuItemId,
    item_name: "E2E Test Item",
    quantity: 1,
    unit_price: 0,
    subtotal: 0,
    status: "served",
  });

  if (itemErr) {
    throw new Error(`Failed to create test order item: ${itemErr.message}`);
  }

  const cleanup = async () => {
    const sb = createServiceClient();
    // Delete in dependency order
    await sb
      .from("stock_movements")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", tenantId);
    await sb
      .from("payments")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", tenantId);
    await sb
      .from("order_items")
      .delete()
      .eq("order_id", order.id)
      .eq("tenant_id", tenantId);
    await sb
      .from("orders")
      .delete()
      .eq("id", order.id)
      .eq("tenant_id", tenantId);
  };

  return { orderId: order.id, cleanup };
}

/**
 * Verify that a stock_movements row exists for this order (i.e. stock was consumed).
 * Returns true if at least one consumption movement was recorded.
 */
export async function verifyStockConsumed(orderId: number): Promise<boolean> {
  const supabase = createServiceClient();
  const tenantId = Number(process.env.E2E_TEST_TENANT_ID);
  const { data } = await supabase
    .from("stock_movements")
    .select("id")
    .eq("order_id", orderId)
    .eq("type", "consumption")
    .eq("tenant_id", tenantId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Get the payment_status of an order from the DB directly.
 */
export async function getOrderPaymentStatus(
  orderId: number,
): Promise<string | null> {
  const supabase = createServiceClient();
  const tenantId = Number(process.env.E2E_TEST_TENANT_ID);
  const { data } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .single();
  return data?.payment_status ?? null;
}
