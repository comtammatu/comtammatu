"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";
import { cartStateSchema, calcItemSubtotal, cartItemSchema } from "./types";
import type { CartState, CartItem } from "./types";

/* ─── Constants ─── */

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

/** Manager+ — void/cancel order flows */
const MANAGER_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "branch_manager",
];

/* ─── Input Schemas ─── */

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

const sessionIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Session ID không hợp lệ" });

const orderIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Order ID không hợp lệ" });

/* ─── submitOrder ─── */

/**
 * Submit a new order from the POS cart.
 * Calls the create_order RPC which atomically creates order + items + status history.
 */
// Skip withAction: complex multi-positional args + RPC
export async function submitOrder(
  branchId: number,
  cart: CartState,
  posSessionId?: number,
  idempotencyKey?: string,
): Promise<ActionResult<{ order_id: number; order_number: string }>> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedCart = cartStateSchema.safeParse(cart);
  if (!parsedCart.success) {
    return { success: false, error: "Dữ liệu giỏ hàng không hợp lệ" };
  }

  if (parsedCart.data.items.length === 0) {
    return { success: false, error: "Giỏ hàng trống" };
  }

  // Validate optional posSessionId
  const posSessionIdSchema = z.coerce.number().int().positive().optional();
  const parsedSessionId = posSessionIdSchema.safeParse(posSessionId);
  if (!parsedSessionId.success) {
    return { success: false, error: "Session ID không hợp lệ" };
  }

  if (idempotencyKey !== undefined) {
    const parsedKey = z.string().uuid().safeParse(idempotencyKey);
    if (!parsedKey.success) {
      return { success: false, error: "Mã giao dịch không hợp lệ" };
    }
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Get user ID for created_by
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Phiên đăng nhập hết hạn" };

  // Transform cart items to RPC JSONB format
  const rpcItems = parsedCart.data.items.map((item) => ({
    menu_item_id: item.menu_item_id,
    variant_id: item.variant_id ?? null,
    item_name: item.item_name,
    variant_name: item.variant_name ?? null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    modifiers: item.modifiers.map((m) => ({
      modifier_id: m.modifier_id,
      name: m.name,
      price: m.price,
    })),
    sides: item.sides.map((s) => ({
      side_item_id: s.side_item_id,
      name: s.name,
      is_default: s.is_default,
    })),
    subtotal: calcItemSubtotal(item),
    note: item.note ?? null,
  }));

  const { data, error } = await supabase.rpc("create_order", {
    p_tenant_id: claims.tenant_id,
    p_branch_id: parsedBranchId.data,
    p_created_by: user.id,
    p_items: rpcItems,
    p_order_type: parsedCart.data.order_type,
    p_table_id: parsedCart.data.table_id ?? undefined,
    p_pos_session_id: parsedSessionId.data ?? undefined,
    p_note: parsedCart.data.note ?? undefined,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    const errCode = String(error.code ?? "");
    const errMsg = String(error.message ?? "").toLowerCase();
    // Postgres insufficient_privilege (often stale RPC overload missing GRANT)
    if (
      errCode === "42501" ||
      errMsg.includes("42501") ||
      errMsg.includes("permission denied")
    ) {
      return {
        success: false,
        error:
          "Không có quyền tạo đơn (hệ thống). Vui lòng đăng nhập lại hoặc liên hệ quản lý.",
      };
    }
    // Postgres advisory lock not available (another order creation in-flight)
    // Avoid hanging the POS UI waiting for a long DB lock.
    if (error.code === "55P03") {
      return {
        success: false,
        error: "Đang có đơn khác được tạo. Vui lòng thử lại sau vài giây.",
      };
    }
    if (error.message?.includes("empty")) {
      return { success: false, error: "Giỏ hàng trống" };
    }
    return {
      success: false,
      error: "Không thể tạo đơn hàng. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    order_id: number;
    order_number: string;
  } | null;

  if (!result) {
    return {
      success: false,
      error: "Không thể tạo đơn hàng. Vui lòng thử lại.",
    };
  }

  return {
    success: true,
    data: { order_id: result.order_id, order_number: result.order_number },
  };
}

/* ─── fetchSessionOrders ─── */

/**
 * Fetch all orders for the current POS session.
 * Used to display order history in the POS sidebar.
 */
// Skip withAction: positional (branchId, sessionId) args
export async function fetchSessionOrders(
  branchId: number,
  sessionId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedSessionId = sessionIdSchema.safeParse(sessionId);
  if (!parsedSessionId.success) {
    return { success: false, error: "Session ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      order_type,
      status,
      total_amount,
      table_id,
      created_at,
      tables ( number )
    `,
    )
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("pos_session_id", parsedSessionId.data)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return { success: false, error: "Không thể tải danh sách đơn hàng." };
  }

  return { success: true, data: orders ?? [] };
}

/* ─── fetchOrderForBill ─── */

/**
 * Fetch a single order with items for bill/receipt display.
 * Includes branch info for receipt header.
 */
export async function fetchOrderForBill(
  orderId: number,
): Promise<ActionResult> {
  const parsedId = orderIdSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  let billQuery = supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      order_type,
      status,
      payment_status,
      payment_method,
      subtotal,
      tax_amount,
      service_charge,
      discount_amount,
      total_amount,
      customer_count,
      note,
      created_at,
      table_id,
      tables (
        number
      ),
      branches (
        name,
        address
      ),
      order_items (
        id,
        item_name,
        variant_name,
        quantity,
        unit_price,
        subtotal,
        modifiers,
        sides,
        note,
        status
      )
    `,
    )
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  // Branch-scoped users can only view their own branch's orders
  if (claims.branch_id) {
    billQuery = billQuery.eq("branch_id", claims.branch_id);
  }

  const { data: order, error } = await billQuery.single();

  if (error) {
    if (error.code === "PGRST116") {
      return { success: false, error: "Không tìm thấy đơn hàng" };
    }
    return {
      success: false,
      error: "Không thể tải đơn hàng. Vui lòng thử lại.",
    };
  }

  return { success: true, data: order };
}

/* ─── fetchOrderDetail — POS sheet (items + status) ─── */

// Skip withAction: complex auth (dual role check POS_ROLES + MANAGER_ROLES)
export async function fetchOrderDetail(orderId: number): Promise<
  ActionResult<{
    order: Record<string, unknown>;
    canManageOrders: boolean;
  }>
> {
  const parsedId = orderIdSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const mgr = await getAuthContext(MANAGER_ROLES);

  const { supabase, claims } = ctx;

  let detailQuery = supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      order_type,
      status,
      payment_status,
      subtotal,
      tax_amount,
      service_charge,
      discount_amount,
      total_amount,
      note,
      created_at,
      table_id,
      tables (
        number
      ),
      branches (
        name,
        address
      ),
      order_items (
        id,
        item_name,
        variant_name,
        quantity,
        unit_price,
        subtotal,
        modifiers,
        sides,
        note,
        status,
        menu_item_id
      )
    `,
    )
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  // Branch-scoped users can only view their own branch's orders
  if (claims.branch_id) {
    detailQuery = detailQuery.eq("branch_id", claims.branch_id);
  }

  const { data: order, error } = await detailQuery.single();

  if (error) {
    if (error.code === "PGRST116") {
      return { success: false, error: "Không tìm thấy đơn hàng" };
    }
    return {
      success: false,
      error: "Không thể tải đơn hàng. Vui lòng thử lại.",
    };
  }

  return {
    success: true,
    data: {
      order: order as unknown as Record<string, unknown>,
      canManageOrders: mgr !== null,
    },
  };
}

/* ─── appendOrderItems ─── */

const appendItemsSchema = z.object({
  orderId: z.coerce
    .number()
    .int()
    .positive({ error: "Order ID không hợp lệ" }),
  items: z.array(cartItemSchema).min(1, { error: "Cần ít nhất một món" }),
});

// Skip withAction: positional (branchId, orderId, items) args
export async function appendOrderItems(
  branchId: number,
  orderId: number,
  items: CartItem[],
): Promise<
  ActionResult<{ subtotal: number; total_amount: number; order_id: number }>
> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsed = appendItemsSchema.safeParse({ orderId, items });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranch.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const rpcItems = parsed.data.items.map((item) => ({
    menu_item_id: item.menu_item_id,
    variant_id: item.variant_id ?? null,
    item_name: item.item_name,
    variant_name: item.variant_name ?? null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    modifiers: item.modifiers.map((m) => ({
      modifier_id: m.modifier_id,
      name: m.name,
      price: m.price,
    })),
    sides: item.sides.map((s) => ({
      side_item_id: s.side_item_id,
      name: s.name,
      is_default: s.is_default,
    })),
    subtotal: calcItemSubtotal(item),
    note: item.note ?? null,
  }));

  const { data, error } = await supabase.rpc("append_order_items", {
    p_order_id: parsed.data.orderId,
    p_items: rpcItems,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("order_not_appendable") || msg.includes("appendable")) {
      return {
        success: false,
        error: "Không thể thêm món vào đơn ở trạng thái này.",
      };
    }
    if (msg.includes("not found") || msg.includes("inactive")) {
      return {
        success: false,
        error: "Món không còn trong thực đơn hoặc đã ngừng bán.",
      };
    }
    return {
      success: false,
      error: "Không thể thêm món. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    order_id: number;
    subtotal: number;
    total_amount: number;
  } | null;

  if (!result) {
    return { success: false, error: "Không thể thêm món. Vui lòng thử lại." };
  }

  return {
    success: true,
    data: {
      order_id: result.order_id,
      subtotal: Number(result.subtotal),
      total_amount: Number(result.total_amount),
    },
  };
}

/* ─── voidOrderItem ─── */

const voidItemSchema = z.object({
  orderItemId: z.coerce
    .number()
    .int()
    .positive({ error: "Món không hợp lệ" }),
  reason: z.string().trim().min(1, { error: "Nhập lý do hủy món" }),
});

// Skip withAction: positional (orderItemId, reason) args + MANAGER_ROLES
export async function voidOrderItem(
  orderItemId: number,
  reason: string,
): Promise<ActionResult<{ autoCancelledOrder: boolean }>> {
  const parsed = voidItemSchema.safeParse({ orderItemId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(MANAGER_ROLES);
  if (!ctx) {
    return { success: false, error: "Cần quyền quản lý để hủy món." };
  }

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("void_order_item", {
    p_order_item_id: parsed.data.orderItemId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("forbidden")) {
      return { success: false, error: "Cần quyền quản lý để hủy món." };
    }
    if (msg.includes("voidable") || msg.includes("served")) {
      return {
        success: false,
        error: "Không thể hủy món đã phục vụ hoặc đã hủy.",
      };
    }
    return { success: false, error: "Không thể hủy món. Vui lòng thử lại." };
  }

  const result = data as unknown as { auto_cancelled_order?: boolean } | null;
  return {
    success: true,
    data: { autoCancelledOrder: result?.auto_cancelled_order === true },
  };
}

/* ─── cancelOrder ─── */

const cancelOrderSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Đơn không hợp lệ" }),
  reason: z.string().trim().min(1, { error: "Nhập lý do hủy đơn" }),
});

// Skip withAction: positional (orderId, reason) args + MANAGER_ROLES
export async function cancelOrder(
  orderId: number,
  reason: string,
): Promise<ActionResult> {
  const parsed = cancelOrderSchema.safeParse({ orderId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(MANAGER_ROLES);
  if (!ctx) {
    return { success: false, error: "Cần quyền quản lý để hủy đơn." };
  }

  const { supabase } = ctx;

  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("forbidden")) {
      return { success: false, error: "Cần quyền quản lý để hủy đơn." };
    }
    if (msg.includes("terminal")) {
      return {
        success: false,
        error: "Đơn đã kết thúc, không thể hủy.",
      };
    }
    return { success: false, error: "Không thể hủy đơn. Vui lòng thử lại." };
  }

  return { success: true, data: null };
}

/* ─── transferOrderTable ─── */

const transferTableSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Đơn không hợp lệ" }),
  newTableId: z.coerce.number().int().positive({ error: "Bàn không hợp lệ" }),
});

// Skip withAction: positional (orderId, newTableId) args
export async function transferOrderTable(
  orderId: number,
  newTableId: number,
): Promise<ActionResult> {
  const parsed = transferTableSchema.safeParse({ orderId, newTableId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc("transfer_order_table", {
    p_order_id: parsed.data.orderId,
    p_new_table_id: parsed.data.newTableId,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("takeaway")) {
      return {
        success: false,
        error: "Chỉ chuyển bàn cho đơn tại bàn.",
      };
    }
    if (msg.includes("not available")) {
      return {
        success: false,
        error: "Bàn đã có khách hoặc không khả dụng.",
      };
    }
    return {
      success: false,
      error: "Không thể chuyển bàn. Vui lòng thử lại.",
    };
  }

  return { success: true, data: null };
}

/* ─── updateOrderStatus (POS) ─── */

const updateOrderStatusSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Đơn không hợp lệ" }),
  newStatus: z.enum(["served", "completed"]),
});

// Skip withAction: positional (orderId, newStatus) args
export async function updateOrderStatus(
  orderId: number,
  newStatus: "served" | "completed",
): Promise<ActionResult> {
  const parsed = updateOrderStatusSchema.safeParse({ orderId, newStatus });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc("update_pos_order_status", {
    p_order_id: parsed.data.orderId,
    p_new_status: parsed.data.newStatus,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("complete requires")) {
      return {
        success: false,
        error: "Đánh dấu phục vụ trước khi hoàn thành.",
      };
    }
    if (msg.includes("items not terminal")) {
      return {
        success: false,
        error: "Còn món chưa sẵn sàng hoặc chưa xử lý xong.",
      };
    }
    if (msg.includes("invalid transition")) {
      return {
        success: false,
        error: "Không thể đổi trạng thái đơn lúc này.",
      };
    }
    return {
      success: false,
      error: "Không thể cập nhật trạng thái. Vui lòng thử lại.",
    };
  }

  return { success: true, data: null };
}

/* ─── fetchOrderItemsForReorder ─── */

export async function fetchOrderItemsForReorder(
  orderId: number,
): Promise<ActionResult<{ items: CartItem[]; skippedCount: number }>> {
  const parsedId = orderIdSchema.safeParse(orderId);
  if (!parsedId.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify the order belongs to this branch before fetching items
  if (claims.branch_id) {
    const { data: orderCheck } = await supabase
      .from("orders")
      .select("id")
      .eq("id", parsedId.data)
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", claims.branch_id)
      .maybeSingle();

    if (!orderCheck) {
      return { success: false, error: "Không tìm thấy đơn hàng" };
    }
  }

  const { data: rows, error } = await supabase
    .from("order_items")
    .select(
      "id, menu_item_id, variant_id, item_name, variant_name, quantity, unit_price, modifiers, sides, note",
    )
    .eq("order_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .neq("status", "cancelled");

  if (error) {
    return {
      success: false,
      error: "Không thể tải món để đặt lại.",
    };
  }

  const menuIds = [...new Set((rows ?? []).map((r) => r.menu_item_id))];
  if (menuIds.length === 0) {
    return { success: true, data: { items: [], skippedCount: 0 } };
  }

  const { data: menuRows, error: menuErr } = await supabase
    .from("menu_items")
    .select("id, is_active, base_price")
    .eq("tenant_id", claims.tenant_id)
    .in("id", menuIds);

  if (menuErr) {
    return {
      success: false,
      error: "Không thể kiểm tra thực đơn.",
    };
  }

  const active = new Map(
    (menuRows ?? [])
      .filter((m) => m.is_active === true)
      .map((m) => [m.id, m.base_price as number]),
  );

  const cartItems: CartItem[] = [];
  let skippedCount = 0;

  for (const r of rows ?? []) {
    if (!active.has(r.menu_item_id)) {
      skippedCount += 1;
      continue;
    }

    const key = `reorder-${r.id}-${r.menu_item_id}`;
    const mods = Array.isArray(r.modifiers)
      ? (r.modifiers as { modifier_id: number; name: string; price: number }[])
      : [];
    const sidesRaw = Array.isArray(r.sides)
      ? (r.sides as {
          side_item_id: number;
          name: string;
          is_default?: boolean;
        }[])
      : [];

    cartItems.push({
      key,
      menu_item_id: r.menu_item_id,
      variant_id: r.variant_id ?? undefined,
      item_name: r.item_name,
      variant_name: r.variant_name ?? undefined,
      quantity: r.quantity,
      unit_price: Number(r.unit_price),
      modifiers: mods.map((m) => ({
        modifier_id: m.modifier_id,
        name: m.name,
        price: Number(m.price),
      })),
      sides: sidesRaw.map((s) => ({
        side_item_id: s.side_item_id,
        name: s.name,
        is_default: s.is_default ?? false,
      })),
      note: r.note ?? undefined,
    });
  }

  return {
    success: true,
    data: { items: cartItems, skippedCount },
  };
}
