"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MODULE_ACL,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission, probePermission } from "../../_lib/auth";
import { cartStateSchema, calcItemSubtotal, cartItemSchema } from "./types";
import type { CartState, CartItem } from "./types";
import { POS_ERROR_CODES } from "./_utils/error-codes";

// Best-effort auto kitchen-print after order create/append. Order is the
// source of truth — never fail the order if printing fails. Returns a
// human-readable Vietnamese warning string when the user should be told
// (no printer configured, missing permission, transport error). Returns
// null when print succeeded or had nothing to send.
async function autoSendKitchen(
  supabase: SupabaseClient,
  orderId: number,
): Promise<string | null> {
  const { error } = await supabase.rpc("enqueue_kitchen_print", {
    p_order_id: orderId,
  });
  if (!error) return null;
  const msg = String(error.message ?? "").toLowerCase();
  if (msg.includes("no active") && msg.includes("printer")) {
    return "Đã đặt món, nhưng chi nhánh chưa cấu hình máy in bếp.";
  }
  if (msg.includes("permission denied")) {
    return "Đã đặt món, nhưng tài khoản chưa có quyền gửi bếp.";
  }
  return "Đã đặt món, chưa gửi được phiếu bếp. Vui lòng thử Gửi bếp lại.";
}

/* ─── Constants ─── */

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

/** POS operators allowed to void/cancel order flows. */
const POS_VOID_ROLES: readonly StaffRole[] = POS_ROLES;

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
    return {
      success: false,
      error: "Branch ID không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_BRANCH,
    };
  }

  const parsedCart = cartStateSchema.safeParse(cart);
  if (!parsedCart.success) {
    return {
      success: false,
      error: "Dữ liệu giỏ hàng không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_CART,
    };
  }

  if (parsedCart.data.items.length === 0) {
    return {
      success: false,
      error: "Giỏ hàng trống",
      errorCode: POS_ERROR_CODES.CART_EMPTY,
    };
  }

  // Validate optional posSessionId
  const posSessionIdSchema = z.coerce.number().int().positive().optional();
  const parsedSessionId = posSessionIdSchema.safeParse(posSessionId);
  if (!parsedSessionId.success) {
    return {
      success: false,
      error: "Session ID không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_SESSION,
    };
  }

  if (idempotencyKey !== undefined) {
    const parsedKey = z.string().uuid().safeParse(idempotencyKey);
    if (!parsedKey.success) {
      return {
        success: false,
        error: "Mã giao dịch không hợp lệ",
        errorCode: POS_ERROR_CODES.INPUT_INVALID_IDEMPOTENCY,
      };
    }
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx)
    return {
      success: false,
      error: "Không có quyền",
      errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return {
      success: false,
      error: "Không có quyền truy cập chi nhánh này",
      errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    };
  }

  // Get user ID for created_by
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      success: false,
      error: "Phiên đăng nhập hết hạn",
      errorCode: POS_ERROR_CODES.AUTH_SESSION_EXPIRED,
    };

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
      price: s.price,
      quantity: s.quantity,
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
        errorCode: POS_ERROR_CODES.DB_PERMISSION_DENIED,
      };
    }
    // Postgres advisory lock not available (another order creation in-flight)
    // Avoid hanging the POS UI waiting for a long DB lock.
    if (error.code === "55P03") {
      return {
        success: false,
        error: "Đang có đơn khác được tạo. Vui lòng thử lại sau vài giây.",
        errorCode: POS_ERROR_CODES.DB_LOCK_NOT_AVAILABLE,
      };
    }
    if (error.message?.includes("empty")) {
      return {
        success: false,
        error: "Giỏ hàng trống",
        errorCode: POS_ERROR_CODES.CART_EMPTY,
      };
    }
    return {
      success: false,
      error: "Không thể tạo đơn hàng. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
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
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  const kitchenWarning = await autoSendKitchen(supabase, result.order_id);
  const kitchenSent = kitchenWarning === null;

  return {
    success: true,
    data: { order_id: result.order_id, order_number: result.order_number },
    meta: {
      kitchenSent,
      ...(kitchenWarning ? { kitchenWarning } : {}),
    },
  };
}

/* ─── fetchActiveOrders ─── */

const ORDER_LIST_SELECT = `
  id,
  order_number,
  order_type,
  status,
  payment_status,
  total_amount,
  table_id,
  created_at,
  tables ( number )
`;

/**
 * Fetch all ACTIVE orders for the branch — orders that POS still needs to
 * act on (kitchen flow + payment). Cross-shift active orders are included
 * by design: an order opened in the previous ca but still unpaid must
 * surface in the current cashier's "Cần xử lý" list.
 *
 * Active = `status ∈ ACTIVE_POS_STATUSES AND payment_status != 'paid'`.
 * No row cap needed — at any moment ≤ ~30-50 active orders even on a
 * busy day.
 */
// Skip withAction: positional (branchId) arg + simple query
export async function fetchActiveOrders(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["new", "confirmed", "preparing", "ready", "served"])
    .neq("payment_status", "paid")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải danh sách đơn hàng." };
  }

  return { success: true, data: orders ?? [] };
}

/* ─── fetchArchivedOrders ─── */

const archivedCursorSchema = z
  .object({
    createdAt: z.string().min(1, { error: "Cursor không hợp lệ" }),
    id: z.coerce.number().int().positive(),
  })
  .nullable()
  .optional();

const fetchArchivedOrdersSchema = z.object({
  branchId: branchIdSchema,
  // null = "Cả chi nhánh hôm nay" (no session filter); number = current session
  sessionId: sessionIdSchema.nullable().optional(),
  pageSize: z.coerce.number().int().min(10).max(100).default(30),
  cursor: archivedCursorSchema,
  q: z.string().trim().max(50).optional(),
});

/**
 * Paginated lookup of archived (paid / cancelled) orders for the POS
 * sidebar's "Đã xử lý" sheet. Keyset cursor on `(created_at desc, id desc)`
 * — stable under concurrent inserts (a payment landing on terminal B
 * mid-scroll cannot duplicate or skip rows on terminal A).
 *
 * Default scope = `pos_session_id` (current session). Setting `sessionId`
 * to null widens the scope to the whole branch (cap is the cursor itself
 * — user only fetches as far as they scroll).
 */
export async function fetchArchivedOrders(
  input: z.infer<typeof fetchArchivedOrdersSchema>,
): Promise<
  ActionResult<{
    rows: unknown[];
    nextCursor: { createdAt: string; id: number } | null;
  }>
> {
  const parsed = fetchArchivedOrdersSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Tham số tải đơn không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { sessionId, pageSize, cursor, q } = parsed.data;

  let query = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .eq("branch_id", parsed.data.branchId)
    .eq("tenant_id", claims.tenant_id)
    // Archived = paid OR cancelled. The `or()` form (PostgREST) avoids a
    // separate query for cancelled-without-payment edge.
    .or("payment_status.eq.paid,status.eq.cancelled");

  if (sessionId !== undefined && sessionId !== null) {
    query = query.eq("pos_session_id", sessionId);
  }

  if (typeof q === "string" && q.length > 0) {
    // ILIKE prefix-or-suffix match on order_number. Cashiers cite the
    // last 3 digits of the đơn most of the time; ILIKE %q% covers that.
    // Wildcard escape: PostgREST `ilike` value is the literal pattern
    // string — caller's q is sanitized by Zod max-length only. Strip
    // PostgREST reserved chars so no operator injection is possible.
    const safeQ = q.replace(/[(),]/g, "");
    if (safeQ.length > 0) {
      query = query.ilike("order_number", `%${safeQ}%`);
    }
  }

  if (cursor !== undefined && cursor !== null) {
    // Keyset: rows STRICTLY after the cursor under (created_at desc, id desc).
    // i.e. (created_at, id) < (cursor.createdAt, cursor.id) lexicographically.
    // PostgREST cannot express composite "<" directly, so we OR two
    // disjoint half-spaces:
    //   created_at < cursor.createdAt
    //   OR (created_at = cursor.createdAt AND id < cursor.id)
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${String(cursor.id)})`,
    );
  }

  // Fetch pageSize+1 to probe nextCursor without a separate count round-trip.
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (error) {
    return { success: false, error: "Không thể tải lịch sử đơn." };
  }

  const fetched = (data ?? []) as Array<{
    id: number;
    created_at: string;
    [k: string]: unknown;
  }>;
  const hasMore = fetched.length > pageSize;
  const rows = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = rows.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? { createdAt: last.created_at, id: last.id }
      : null;

  return { success: true, data: { rows, nextCursor } };
}

const activeTableOrderSchema = z.object({
  branchId: branchIdSchema,
  tableId: z.coerce.number().int().positive({ error: "Bàn không hợp lệ" }),
});

/**
 * Look up the active order for a table AND return its full detail in a
 * single round-trip. Previously this returned only {id, order_number};
 * that meant the caller (shell → OrderDetailSheet) did two fetches
 * (lookup + fetchOrderDetail) to open the detail view. Now the caller
 * can seed OrderDetailSheet directly with the returned payload.
 *
 * Shape mirrors fetchOrderDetail so the shell can treat both sources
 * uniformly.
 */
export async function fetchActiveOrderForTable(
  branchId: number,
  tableId: number,
): Promise<
  ActionResult<{
    order: Record<string, unknown>;
    canManageOrders: boolean;
  } | null>
> {
  const parsed = activeTableOrderSchema.safeParse({ branchId, tableId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Parallelize: data SELECT + void-permission probe (UI hint only).
  // Probe reuses the same supabase client → skips a 2nd getUser() HTTP
  // round-trip + getSession() cookie parse. This is the dominant latency
  // cut on table-click (Server Action goes from 6 round-trips to 3).
  const [{ data, error }, canManageOrders] = await Promise.all([
    supabase
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
        status,
        menu_item_id
      )
    `,
      )
      .eq("branch_id", parsed.data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("table_id", parsed.data.tableId)
      .in("status", ["new", "confirmed", "preparing", "ready", "served"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    probePermission(ctx, PERMISSION_KEYS.POS_VOID_ORDER, claims.branch_id),
  ]);

  if (error) {
    return {
      success: false,
      error: "Không thể tải đơn của bàn. Vui lòng thử lại.",
    };
  }

  if (data === null) return { success: true, data: null };

  return {
    success: true,
    data: {
      order: data,
      canManageOrders,
    },
  };
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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
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

// Skip withAction: complex auth (POS view + POS void permission hint)
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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

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

  // Parallelize: data SELECT + void-permission probe (UI hint only).
  // Probe reuses the same supabase client → skips a 2nd getUser() HTTP
  // round-trip + getSession() cookie parse. Server-side void/cancel RPCs
  // remain the authoritative gate; hint=false on probe error is fail-safe.
  const [{ data: order, error }, canManageOrders] = await Promise.all([
    detailQuery.single(),
    probePermission(ctx, PERMISSION_KEYS.POS_VOID_ORDER, claims.branch_id),
  ]);

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
      canManageOrders,
    },
  };
}

/* ─── appendOrderItems ─── */

const appendItemsSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Order ID không hợp lệ" }),
  items: z.array(cartItemSchema).min(1, { error: "Cần ít nhất một món" }),
});

// Skip withAction: positional (branchId, orderId, items, idempotencyKey) args
export async function appendOrderItems(
  branchId: number,
  orderId: number,
  items: CartItem[],
  idempotencyKey?: string,
): Promise<
  ActionResult<{
    order_id: number;
    subtotal: number;
    total_amount: number;
    added_count: number;
    idempotent?: boolean;
  }>
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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
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
      price: s.price,
      quantity: s.quantity,
      is_default: s.is_default,
    })),
    subtotal: calcItemSubtotal(item),
    note: item.note ?? null,
  }));

  const { data, error } = await supabase.rpc("append_order_items", {
    p_order_id: parsed.data.orderId,
    p_items: rpcItems,
    p_idempotency_key: idempotencyKey ?? undefined,
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
    success: boolean;
    order_id: number;
    added_count: number;
    subtotal: number;
    total_amount: number;
    idempotent?: boolean;
  } | null;

  if (!result) {
    return { success: false, error: "Không thể thêm món. Vui lòng thử lại." };
  }

  // Skip kitchen reprint on idempotent replay — first call already enqueued.
  const kitchenWarning = result.idempotent
    ? null
    : await autoSendKitchen(supabase, result.order_id);
  // Only claim "đã gửi bếp" when this call actually dispatched. Idempotent
  // replay short-circuits the print, so we don't know the first call's
  // outcome here and must not falsely affirm it.
  const kitchenSent = !result.idempotent && kitchenWarning === null;

  return {
    success: true,
    data: {
      order_id: result.order_id,
      subtotal: Number(result.subtotal),
      total_amount: Number(result.total_amount),
      added_count: Number(result.added_count),
      ...(result.idempotent ? { idempotent: true } : {}),
    },
    meta: {
      kitchenSent,
      ...(kitchenWarning ? { kitchenWarning } : {}),
    },
  };
}

/* ─── voidOrderItem ─── */

const voidItemSchema = z.object({
  orderItemId: z.coerce.number().int().positive({ error: "Món không hợp lệ" }),
  // min(5): single-char "x" reasons defeat the audit trail. 5 is the floor
  // that still admits short legitimate reasons ("hết", "khách đổi") while
  // rejecting fat-finger noise. Stocktake escalation uses 20 (see rule
  // R4-ESCALATE-NOTE-MIN-CHARS); POS void is more frequent so 5 balances
  // operator friction with audit value.
  reason: z
    .string()
    .trim()
    .min(5, { error: "Lý do hủy món tối thiểu 5 ký tự" }),
});

// Skip withAction: positional (orderItemId, reason) args + POS_VOID_ROLES
export async function voidOrderItem(
  orderItemId: number,
  reason: string,
): Promise<
  ActionResult<{
    autoCancelledOrder: boolean;
    /** Present when the kitchen cancel-ticket enqueue was attempted but
     * failed (printer offline / RLS). Void itself always succeeded. UI
     * surfaces as a toast warning. */
    printWarning?: string;
  }>
> {
  const parsed = voidItemSchema.safeParse({ orderItemId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_VOID_ROLES,
    PERMISSION_KEYS.POS_VOID_ORDER,
  );
  if (!ctx) {
    return { success: false, error: "Cần quyền hủy đơn POS để hủy món." };
  }

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("void_order_item", {
    p_order_item_id: parsed.data.orderItemId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("forbidden")) {
      return { success: false, error: "Cần quyền hủy đơn POS để hủy món." };
    }
    if (msg.includes("voidable") || msg.includes("served")) {
      return {
        success: false,
        error: "Không thể hủy món đã phục vụ hoặc đã hủy.",
      };
    }
    return { success: false, error: "Không thể hủy món. Vui lòng thử lại." };
  }

  const result = data as unknown as {
    auto_cancelled_order?: boolean;
    was_sent_to_kitchen?: boolean;
  } | null;

  // Fire cancel-ticket print when the kitchen actually saw the item.
  // Print failure is non-fatal — the void itself is already committed;
  // the worst case is chef continues cooking for a few seconds until
  // KDS realtime catches up. Surface as a toast warning, not an error.
  let printWarning: string | undefined;
  if (result?.was_sent_to_kitchen) {
    const { data: printData, error: printError } = await supabase.rpc(
      "enqueue_cancel_ticket_print",
      {
        p_order_item_id: parsed.data.orderItemId,
        p_reason: parsed.data.reason,
      },
    );
    if (printError) {
      const msg = String(printError.message ?? "").toLowerCase();
      if (msg.includes("permission denied")) {
        printWarning =
          "Đã huỷ món. Không có quyền in phiếu huỷ — báo bếp thủ công.";
      } else if (msg.includes("tenant mismatch")) {
        printWarning = "Đã huỷ món. Lỗi quyền tenant khi in phiếu huỷ.";
      } else {
        printWarning =
          "Đã huỷ món. Không in được phiếu huỷ — kiểm tra máy in bếp.";
      }
    } else {
      // RPC returns {skipped: true, reason: 'no_slot'|'no_printer'|...} when
      // the item exists but the cancel ticket cannot be routed (drink with
      // no kitchen slot, kitchen printer offline, feature flag off).
      const skipReason = (printData as { skipped?: boolean; reason?: string } | null)
        ?.skipped
        ? (printData as { reason?: string }).reason
        : undefined;
      if (skipReason === "no_printer") {
        printWarning = "Đã huỷ món. Máy in bếp offline — báo bếp trực tiếp.";
      } else if (skipReason === "no_slot") {
        printWarning =
          "Đã huỷ món. Món không thuộc khu vực bếp (đồ uống chai?) — báo bar trực tiếp.";
      } else if (skipReason === "feature_disabled") {
        printWarning =
          "Đã huỷ món. Tính năng in phiếu huỷ đang tắt — báo bếp trực tiếp.";
      }
    }
  }

  return {
    success: true,
    data: {
      autoCancelledOrder: result?.auto_cancelled_order === true,
      printWarning,
    },
  };
}

/* ─── cancelOrder ─── */

const cancelOrderSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Đơn không hợp lệ" }),
  // min(5): cancelling a whole order destroys revenue + sometimes leaks
  // food cost. Single-char "x" defeats the audit trail. 5 is the floor —
  // long enough for short legitimate reasons ("hết", "khách đổi") yet
  // strong enough to reject fat-finger noise. UI guard MUST mirror this
  // in the CancelOrderDialog before submit so cashier sees the rule
  // before the action call rather than getting a delayed server reject.
  reason: z
    .string()
    .trim()
    .min(5, { error: "Lý do hủy đơn tối thiểu 5 ký tự" }),
});

// Skip withAction: positional (orderId, reason) args + POS_VOID_ROLES
export async function cancelOrder(
  orderId: number,
  reason: string,
): Promise<
  ActionResult<{
    cancelTickets: number;
    cancelSkipped: number;
    /** Surfaced when ≥1 cancelled item could not enqueue a kitchen/bar
     * ticket (no_slot for drinks, no_printer for offline hardware, etc.).
     * UI toasts so the operator can verbally notify the affected station. */
    printWarning?: string;
  }>
> {
  const parsed = cancelOrderSchema.safeParse({ orderId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_VOID_ROLES,
    PERMISSION_KEYS.POS_VOID_ORDER,
  );
  if (!ctx) {
    return { success: false, error: "Cần quyền hủy đơn POS để hủy đơn." };
  }

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("cancel_order", {
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("forbidden")) {
      return { success: false, error: "Cần quyền hủy đơn POS để hủy đơn." };
    }
    if (msg.includes("terminal")) {
      return {
        success: false,
        error: "Đơn đã kết thúc, không thể hủy.",
      };
    }
    return { success: false, error: "Không thể hủy đơn. Vui lòng thử lại." };
  }

  const result = data as unknown as {
    order_id?: number;
    status?: string;
    cancel_tickets?: number;
    cancel_skipped?: number;
    skip_reasons?: string[];
  } | null;

  const skipped = result?.cancel_skipped ?? 0;
  let printWarning: string | undefined;
  if (skipped > 0) {
    const reasons = result?.skip_reasons ?? [];
    const has = (k: string) => reasons.some((r) => r.startsWith(k));
    if (has("no_printer")) {
      printWarning = `Đã huỷ đơn. ${skipped} món bếp/bar không nhận được phiếu báo huỷ (máy in offline) — báo trực tiếp.`;
    } else if (has("no_slot")) {
      printWarning = `Đã huỷ đơn. ${skipped} món không có khu vực bếp (đồ uống chai?) — báo bar trực tiếp.`;
    } else if (has("feature_disabled")) {
      printWarning = "Đã huỷ đơn. Tính năng in phiếu huỷ đang tắt — báo bếp trực tiếp.";
    } else {
      printWarning = `Đã huỷ đơn. ${skipped} phiếu huỷ không in được — báo bếp/bar trực tiếp.`;
    }
  }

  return {
    success: true,
    data: {
      cancelTickets: result?.cancel_tickets ?? 0,
      cancelSkipped: skipped,
      printWarning,
    },
  };
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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
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
  newStatus: z.enum(["served"]),
});

// Skip withAction: positional (orderId, newStatus) args
export async function updateOrderStatus(
  orderId: number,
  newStatus: "served",
): Promise<ActionResult> {
  const parsed = updateOrderStatusSchema.safeParse({ orderId, newStatus });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
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

/* ─── markOrderItemServed (POS waiter per-item) ─── */

const markOrderItemServedSchema = z.object({
  itemId: z.coerce.number().int().positive({ error: "Món không hợp lệ" }),
});

export async function markOrderItemServed(
  itemId: number,
): Promise<ActionResult> {
  const parsed = markOrderItemServedSchema.safeParse({ itemId });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc("mark_order_item_served", {
    p_item_id: parsed.data.itemId,
  });

  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("invalid item transition")) {
      return {
        success: false,
        error: "Món đã phục vụ hoặc đã hủy.",
      };
    }
    if (msg.includes("order terminal")) {
      return {
        success: false,
        error: "Đơn đã đóng, không thể cập nhật món.",
      };
    }
    if (msg.includes("item not found")) {
      return { success: false, error: "Không tìm thấy món." };
    }
    return {
      success: false,
      error: "Không thể đánh dấu phục vụ. Vui lòng thử lại.",
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

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
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

  const mainIds = (rows ?? []).map((r) => r.menu_item_id);
  const sideIds = (rows ?? []).flatMap((r) => {
    const arr = Array.isArray(r.sides)
      ? (r.sides as { side_item_id: number }[])
      : [];
    return arr.map((s) => s.side_item_id);
  });
  const menuIds = [...new Set([...mainIds, ...sideIds])];
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

  const livePrices = new Map(
    (menuRows ?? [])
      .filter((m) => m.is_active === true)
      .map((m) => [m.id, Number(m.base_price)]),
  );

  const variantIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.variant_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];

  const liveVariantAdj = new Map<number, number>();
  if (variantIds.length > 0) {
    const { data: variantRows, error: variantErr } = await supabase
      .from("menu_item_variants")
      .select("id, is_active, price_adjustment")
      .eq("tenant_id", claims.tenant_id)
      .in("id", variantIds);

    if (variantErr) {
      return {
        success: false,
        error: "Không thể kiểm tra biến thể thực đơn.",
      };
    }

    for (const v of variantRows ?? []) {
      if (v.is_active === true) {
        liveVariantAdj.set(v.id, Number(v.price_adjustment ?? 0));
      }
    }
  }

  const modifierIds = [
    ...new Set(
      (rows ?? []).flatMap((r) => {
        const mods = Array.isArray(r.modifiers)
          ? (r.modifiers as { modifier_id: number }[])
          : [];
        return mods.map((m) => m.modifier_id);
      }),
    ),
  ];

  const liveModifierPrices = new Map<number, number>();
  if (modifierIds.length > 0) {
    const { data: modifierRows, error: modifierErr } = await supabase
      .from("menu_item_modifiers")
      .select("id, is_active, price")
      .eq("tenant_id", claims.tenant_id)
      .in("id", modifierIds);

    if (modifierErr) {
      return {
        success: false,
        error: "Không thể kiểm tra tùy chọn thực đơn.",
      };
    }

    for (const m of modifierRows ?? []) {
      if (m.is_active === true) {
        liveModifierPrices.set(m.id, Number(m.price ?? 0));
      }
    }
  }

  const cartItems: CartItem[] = [];
  let skippedCount = 0;

  for (const r of rows ?? []) {
    const basePrice = livePrices.get(r.menu_item_id);
    if (basePrice === undefined) {
      skippedCount += 1;
      continue;
    }

    const variantId = r.variant_id;
    if (variantId != null && !liveVariantAdj.has(variantId)) {
      // Cached variant is no longer active — skip line to avoid stale pricing.
      skippedCount += 1;
      continue;
    }
    const variantAdj =
      variantId != null ? (liveVariantAdj.get(variantId) ?? 0) : 0;

    const modsRaw = Array.isArray(r.modifiers)
      ? (r.modifiers as { modifier_id: number; name: string; price: number }[])
      : [];
    const liveMods = modsRaw
      .map((m) => {
        const livePrice = liveModifierPrices.get(m.modifier_id);
        if (livePrice === undefined) return null;
        return {
          modifier_id: m.modifier_id,
          name: m.name,
          price: livePrice,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    // Preserve line only if all original modifiers are still live.
    if (liveMods.length !== modsRaw.length) {
      skippedCount += 1;
      continue;
    }

    const sidesRaw = Array.isArray(r.sides)
      ? (r.sides as {
          side_item_id: number;
          name: string;
          price?: number;
          quantity?: number;
          is_default?: boolean;
        }[])
      : [];

    const liveSides = sidesRaw
      .map((s) => {
        const livePrice = livePrices.get(s.side_item_id);
        if (livePrice === undefined) return null;
        return {
          side_item_id: s.side_item_id,
          name: s.name,
          price: livePrice,
          quantity: s.quantity ?? 1,
          is_default: s.is_default ?? false,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (liveSides.length !== sidesRaw.length) {
      skippedCount += 1;
      continue;
    }

    const key = `reorder-${r.id}-${r.menu_item_id}`;
    cartItems.push({
      key,
      menu_item_id: r.menu_item_id,
      variant_id: variantId ?? undefined,
      item_name: r.item_name,
      variant_name: r.variant_name ?? undefined,
      quantity: r.quantity,
      unit_price: basePrice + variantAdj,
      modifiers: liveMods,
      sides: liveSides,
      note: r.note ?? undefined,
    });
  }

  return {
    success: true,
    data: { items: cartItems, skippedCount },
  };
}
