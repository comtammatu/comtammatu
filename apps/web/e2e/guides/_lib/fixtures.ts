/**
 * DB state setup helpers cho guide capture — dùng service-role để bypass RLS.
 *
 * Mỗi helper là idempotent: gọi nhiều lần ra cùng kết quả, không leak state
 * giữa scenario.
 *
 * ⚠️ MUTATE DB của test branch. Không chạy trên DB production.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY phải có trong .env.test.local",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface CashierContext {
  userId: string;
  email: string;
  tenantId: number;
  branchId: number;
}

let cachedContext: CashierContext | null = null;

/** Resolve cashier test account → tenantId, branchId qua email. */
export async function getCashierContext(): Promise<CashierContext> {
  if (cachedContext) return cachedContext;

  const email = process.env.E2E_CASHIER_EMAIL;
  if (!email) {
    throw new Error("E2E_CASHIER_EMAIL phải có trong .env.test.local");
  }

  const supabase = createServiceClient();
  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);

  const authUser = users.find((u) => u.email === email);
  if (!authUser) throw new Error(`Cashier user không tìm thấy: ${email}`);

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, tenant_id, branch_id")
    .eq("id", authUser.id)
    .single();
  if (profErr || !profile) {
    throw new Error(`Profile không tìm thấy cho ${email}: ${profErr?.message}`);
  }
  if (!profile.branch_id) {
    throw new Error(`Cashier ${email} chưa được phân chi nhánh`);
  }

  cachedContext = {
    userId: profile.id,
    email,
    tenantId: profile.tenant_id,
    branchId: profile.branch_id,
  };
  return cachedContext;
}

/** Đóng mọi ca POS đang mở của branch. Dùng để có state "form mở ca trống". */
export async function closeAllOpenSessions(ctx: CashierContext): Promise<void> {
  const supabase = createServiceClient();
  const { data: openSessions } = await supabase
    .from("pos_sessions")
    .select("id, opening_cash")
    .eq("branch_id", ctx.branchId)
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "open");

  for (const session of openSessions ?? []) {
    await supabase
      .from("pos_sessions")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: ctx.userId,
        closing_cash: session.opening_cash,
      })
      .eq("id", session.id);
  }
}

/**
 * Đảm bảo cashier có 1 ca POS đang mở duy nhất (đóng các ca khác).
 * Dùng cho mọi flow sau POS-01 — landing trực tiếp lên màn POS chính.
 *
 * Per-branch model (Owner D7, 2026-04-27): branch chỉ có 1 session active.
 * `terminal_id` nullable — fixture không cần lookup terminal, set null để
 * giảm coupling với pos_terminals seed.
 */
export async function ensureSingleOpenSession(
  ctx: CashierContext,
): Promise<void> {
  await closeAllOpenSessions(ctx);

  const supabase = createServiceClient();
  await supabase.from("pos_sessions").insert({
    tenant_id: ctx.tenantId,
    branch_id: ctx.branchId,
    terminal_id: null,
    opened_by: ctx.userId,
    opening_cash: 500000,
    status: "open",
  });
}

/** Đảm bảo branch có ÍT NHẤT N bàn active (status='available'). Tạo thêm nếu thiếu. */
export async function ensureMinTables(
  ctx: CashierContext,
  minCount: number,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("tables")
    .select("id, number, status")
    .eq("branch_id", ctx.branchId)
    .eq("tenant_id", ctx.tenantId)
    .neq("status", "maintenance");

  const have = existing?.length ?? 0;
  if (have >= minCount) {
    // Reset all existing tables to 'available' for a clean state
    if (existing) {
      for (const t of existing) {
        if (t.status !== "available") {
          await supabase
            .from("tables")
            .update({ status: "available" })
            .eq("id", t.id);
        }
      }
    }
    return;
  }

  const maxNumber = Math.max(0, ...(existing?.map((t) => t.number) ?? []));
  for (let i = 0; i < minCount - have; i++) {
    await supabase.from("tables").insert({
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      number: maxNumber + i + 1,
      capacity: 4,
      status: "available",
    });
  }
}

/**
 * Ensure one table with status='occupied' and 1+ 'confirmed' orders bound
 * to it. Returns tableId + tableNumber so specs can assert.
 */
export async function ensureOccupiedTableWithOrder(
  ctx: CashierContext,
): Promise<{ tableId: number; tableNumber: number }> {
  const supabase = createServiceClient();

  // Find the cashier's open session to bind the order to
  const { data: openSession } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("branch_id", ctx.branchId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (!openSession) {
    throw new Error(
      "ensureOccupiedTableWithOrder: cần ensureSingleOpenSession() trước",
    );
  }

  // Ensure at least 2 tables (1 stays free + 1 gets occupied)
  await ensureMinTables(ctx, 2);

  const { data: tables } = await supabase
    .from("tables")
    .select("id, number")
    .eq("branch_id", ctx.branchId)
    .eq("tenant_id", ctx.tenantId)
    .neq("status", "maintenance")
    .order("number")
    .limit(2);

  const targetTable = tables?.[0];
  if (!targetTable) {
    throw new Error("ensureOccupiedTableWithOrder: không tạo được bàn");
  }

  // Find any active menu_item to attach the order_item to
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id, name, base_price")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!menuItem) {
    throw new Error("ensureOccupiedTableWithOrder: branch chưa có menu_item");
  }

  // Clean up this table's old orders (idempotent)
  const { data: oldOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("table_id", targetTable.id)
    .eq("tenant_id", ctx.tenantId)
    .in("status", ["pending", "confirmed", "ready", "served"]);
  for (const o of oldOrders ?? []) {
    await supabase
      .from("kds_tickets")
      .delete()
      .eq("order_id", o.id)
      .eq("tenant_id", ctx.tenantId);
    await supabase
      .from("order_items")
      .delete()
      .eq("order_id", o.id)
      .eq("tenant_id", ctx.tenantId);
    await supabase
      .from("orders")
      .delete()
      .eq("id", o.id)
      .eq("tenant_id", ctx.tenantId);
  }

  const unitPrice = Number(menuItem.base_price);
  const orderNumber = `GUIDE-${String(Date.now())}`;
  const { data: order } = await supabase
    .from("orders")
    .insert({
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      table_id: targetTable.id,
      order_number: orderNumber,
      order_type: "dine_in",
      status: "confirmed",
      payment_status: "unpaid",
      subtotal: unitPrice,
      tax_amount: 0,
      service_charge: 0,
      discount_amount: 0,
      total_amount: unitPrice,
      customer_count: 2,
      created_by: ctx.userId,
      pos_session_id: openSession.id,
    })
    .select("id")
    .single();

  if (order) {
    // 2 item rows so the split workflow is available (canShowSplit needs activeItemCount >= 2)
    await supabase.from("order_items").insert([
      {
        tenant_id: ctx.tenantId,
        order_id: order.id,
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        quantity: 1,
        unit_price: unitPrice,
        modifiers: [],
        sides: [],
        subtotal: unitPrice,
        status: "pending",
      },
      {
        tenant_id: ctx.tenantId,
        order_id: order.id,
        menu_item_id: menuItem.id,
        item_name: menuItem.name,
        quantity: 1,
        unit_price: unitPrice,
        modifiers: [],
        sides: [],
        subtotal: unitPrice,
        status: "pending",
      },
    ]);
    // Recompute totals
    const newSubtotal = unitPrice * 2;
    await supabase
      .from("orders")
      .update({ subtotal: newSubtotal, total_amount: newSubtotal })
      .eq("id", order.id);
  }

  await supabase
    .from("tables")
    .update({ status: "occupied" })
    .eq("id", targetTable.id)
    .eq("tenant_id", ctx.tenantId);

  return { tableId: targetTable.id, tableNumber: targetTable.number };
}

/**
 * Tạo thêm 1 đơn confirmed thứ 2 trên CÙNG bàn — cho merge workflow available
 * (canShowMerge cần tableSiblingCount >= 2).
 *
 * Yêu cầu chạy SAU ensureOccupiedTableWithOrder(ctx).
 */
export async function ensureSecondOrderSameTable(
  ctx: CashierContext,
  tableId: number,
): Promise<void> {
  const supabase = createServiceClient();

  const { data: openSession } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("branch_id", ctx.branchId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (!openSession) {
    throw new Error(
      "ensureSecondOrderSameTable: cần ensureSingleOpenSession()",
    );
  }

  // Count active orders on the table
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("table_id", tableId)
    .eq("tenant_id", ctx.tenantId)
    .in("status", ["pending", "confirmed", "ready", "served"]);

  if ((existing?.length ?? 0) >= 2) return; // already enough

  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id, name, base_price")
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!menuItem) {
    throw new Error("ensureSecondOrderSameTable: branch chưa có menu_item");
  }

  const unitPrice = Number(menuItem.base_price);
  const { data: order2 } = await supabase
    .from("orders")
    .insert({
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      table_id: tableId,
      order_number: `GUIDE2-${String(Date.now())}`,
      order_type: "dine_in",
      status: "confirmed",
      payment_status: "unpaid",
      subtotal: unitPrice,
      tax_amount: 0,
      service_charge: 0,
      discount_amount: 0,
      total_amount: unitPrice,
      customer_count: 1,
      created_by: ctx.userId,
      pos_session_id: openSession.id,
    })
    .select("id")
    .single();

  if (order2) {
    await supabase.from("order_items").insert({
      tenant_id: ctx.tenantId,
      order_id: order2.id,
      menu_item_id: menuItem.id,
      item_name: menuItem.name,
      quantity: 1,
      unit_price: unitPrice,
      modifiers: [],
      sides: [],
      subtotal: unitPrice,
      status: "pending",
    });
  }
}

/** Đảm bảo branch có ÍT NHẤT N máy POS active. Tạo thêm nếu thiếu. */
export async function ensureMinTerminals(
  ctx: CashierContext,
  minCount: number,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("pos_terminals")
    .select("id")
    .eq("branch_id", ctx.branchId)
    .eq("tenant_id", ctx.tenantId)
    .eq("is_active", true);

  const have = existing?.length ?? 0;
  for (let i = have; i < minCount; i++) {
    const idx = i + 1;
    await supabase.from("pos_terminals").insert({
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId,
      name: `Máy quầy ${String.fromCharCode(64 + idx)}`,
      device_id: `guide-fixture-${String(idx)}`,
      is_active: true,
    });
  }
}
