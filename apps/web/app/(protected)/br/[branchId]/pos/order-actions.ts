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
import { withActionPositional } from "@/_lib/with-action";
import {
  cartStateSchema,
  calcItemSubtotal,
  cartItemSchema,
  cartModifierSchema,
  cartSideSchema,
} from "./types";
import type { CartState, CartItem } from "./types";
import { POS_ERROR_CODES } from "./_utils/error-codes";
import {
  cancelOrderSchema,
  editPendingItemSchema,
  markOrderItemServedSchema,
  priorityInputSchema,
  reduceItemSchema,
  transferTableSchema,
  updateOrderStatusSchema,
  voidItemSchema,
} from "./_lib/schemas";
import type { EditPendingOrderItemInput } from "./_lib/schemas";
import { posUseAuth, posVoidAuth } from "./_lib/auth";
import {
  cancelRpcFallback,
  cancelRpcMappings,
  cancelSkipReasonsToWarning,
  editPrintErrorToWarning,
  editPrintSkipReasonToWarning,
  editRpcFallback,
  editRpcMappings,
  enqueueCancelTicketPrintHook,
  enqueuePartialCancelTicketPrintHook,
  mapPriorityError,
  mapRpcError,
  markServedRpcFallback,
  markServedRpcMappings,
  reduceRpcFallback,
  reduceRpcMappings,
  transferRpcFallback,
  transferRpcMappings,
  updateOrderStatusRpcFallback,
  updateOrderStatusRpcMappings,
  voidRpcFallback,
  voidRpcMappings,
} from "./_lib/messages";

async function markInitialOrderPriority(
  supabase: SupabaseClient,
  orderId: number,
): Promise<string | null> {
  const { error } = await supabase.rpc("set_pos_order_priority", {
    p_order_id: orderId,
    p_is_priority: true,
  });

  if (!error) return null;

  return `Đã đặt món, nhưng chưa đánh dấu ưu tiên. ${mapPriorityError(error.message, "order")}`;
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
    // Stale `pos_session_id` from RSC props: cashier closed (and re-opened)
    // the shift on another tab/terminal while this tab still holds the old
    // `session.id`. RPC raises P0002 with this exact wording. Surface a
    // typed code so the client can `router.refresh()` to pick up the new
    // session instead of looping the cashier through "thử lại" forever.
    if (
      errMsg.includes("pos session does not belong") ||
      errMsg.includes("is not open")
    ) {
      return {
        success: false,
        error: "Ca POS đã đóng hoặc đổi máy — đang tải lại trang.",
        errorCode: POS_ERROR_CODES.SCOPE_SESSION_NOT_OPEN,
      };
    }
    if (errMsg.includes("daily_limit_item_disabled")) {
      return {
        success: false,
        error: "Có món đã bị tắt trong ngày — bỏ khỏi giỏ trước khi đặt.",
        errorCode: POS_ERROR_CODES.DAILY_LIMIT_ITEM_DISABLED,
      };
    }
    if (errMsg.includes("daily_limit_exceeded")) {
      return {
        success: false,
        error: "Có món đã hết suất hôm nay — giảm số lượng hoặc đổi món.",
        errorCode: POS_ERROR_CODES.DAILY_LIMIT_EXCEEDED,
      };
    }
    if (
      errMsg.includes("stale_side_or_modifier") ||
      errMsg.includes("stale modifier") ||
      errMsg.includes("stale side")
    ) {
      return {
        success: false,
        error:
          "Tùy chọn món đã thay đổi. Vui lòng mở món và chọn lại trước khi đặt.",
        errorCode: POS_ERROR_CODES.CART_STALE_MENU_OPTION,
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

  const priorityWarning =
    parsedCart.data.is_priority === true
      ? await markInitialOrderPriority(supabase, result.order_id)
      : null;

  return {
    success: true,
    data: { order_id: result.order_id, order_number: result.order_number },
    meta: {
      prioritySet:
        parsedCart.data.is_priority === true && priorityWarning === null,
      ...(priorityWarning ? { priorityWarning } : {}),
    },
  };
}

/* ─── fetchActiveOrders ─── */

// Widened to mirror SessionOrder so realtime applyOrderUpdate can patch all
// fields the cashier UI reads (totals, discount metadata, merge/split refs).
// Adding fields here is REQUIRED before dropping post-mutation refetch — list
// pane and detail-sheet headers both consume these for in-place updates.
const ORDER_LIST_SELECT = `
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
  discount_type,
  discount_value,
  discount_note,
  is_priority,
  total_amount,
  table_id,
  customer_count,
  note,
  merged_into_order_id,
  split_from_order_id,
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
      discount_type,
      discount_value,
      discount_note,
      total_amount,
      customer_count,
      note,
      is_priority,
      created_at,
      table_id,
      split_from_order_id,
      merged_into_order_id,
      tables (
        number
      ),
      branches (
        name,
        address
      ),
      profiles!orders_created_by_fkey (
        full_name
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
        is_priority,
        status,
        menu_item_id,
        variant_id
      )
    `,
      )
      .eq("branch_id", parsed.data.branchId)
      .eq("tenant_id", claims.tenant_id)
      .eq("table_id", parsed.data.tableId)
      .in("status", ["new", "confirmed", "preparing", "ready", "served"])
      .neq("payment_status", "paid")
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
      discount_type,
      discount_value,
      discount_note,
      total_amount,
      customer_count,
      cash_received,
      cash_change,
      note,
      is_priority,
      created_at,
      table_id,
      split_from_order_id,
      merged_into_order_id,
      tables (
        number
      ),
      branches (
        name,
        address,
        phone
      ),
      profiles!orders_created_by_fkey (
        full_name
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
        is_priority,
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
      discount_type,
      discount_value,
      discount_note,
      total_amount,
      customer_count,
      note,
      is_priority,
      created_at,
      table_id,
      split_from_order_id,
      merged_into_order_id,
      tables (
        number
      ),
      branches (
        name,
        address
      ),
      profiles!orders_created_by_fkey (
        full_name
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
        is_priority,
        status,
        menu_item_id,
        variant_id
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
    if (msg.includes("daily_limit_item_disabled")) {
      return {
        success: false,
        error: "Có món đã bị tắt trong ngày — bỏ khỏi giỏ trước khi đặt.",
      };
    }
    if (msg.includes("daily_limit_exceeded")) {
      return {
        success: false,
        error: "Có món đã hết suất hôm nay — giảm số lượng hoặc đổi món.",
      };
    }
    if (
      msg.includes("stale_side_or_modifier") ||
      msg.includes("stale modifier") ||
      msg.includes("stale side")
    ) {
      return {
        success: false,
        error:
          "Tùy chọn món đã thay đổi. Vui lòng mở món và chọn lại trước khi thêm.",
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

  return {
    success: true,
    data: {
      order_id: result.order_id,
      subtotal: Number(result.subtotal),
      total_amount: Number(result.total_amount),
      added_count: Number(result.added_count),
      ...(result.idempotent ? { idempotent: true } : {}),
    },
  };
}

/* ─── voidOrderItem ─── */

/**
 * Void a single pending / kitchen-sent order item with audit reason.
 *
 * WS-1a (2026-05-27) proving slice for the extended `withActionPositional`
 * helper. Migrated from the prior hand-rolled `// Skip withAction:` block.
 * Exercises 4/4 new helper capabilities in one site:
 *   1. positional args (orderItemId, reason) preserved via `argsToInput`
 *   2. composite auth via `customAuth: posVoidAuth`
 *   3. RPC error vocabulary via `mapRpcError(..., voidRpcMappings, voidRpcFallback)`
 *   4. non-fatal post-RPC cancel-ticket print via `afterSuccess: enqueueCancelTicketPrintHook`
 *
 * Result shape change vs pre-WS-1a:
 *   - `data.autoCancelledOrder` UNCHANGED
 *   - `data.printWarning` REMOVED — print warning now lives on
 *     `result.meta.warning` (set by the afterSuccess hook). The caller
 *     `order-detail-sheet.tsx` was updated in the same commit.
 */
export const voidOrderItem = withActionPositional(
  {
    argsToInput: (orderItemId: number, reason: string) => ({
      orderItemId,
      reason,
    }),
    schema: voidItemSchema,
    customAuth: posVoidAuth,
    afterSuccess: enqueueCancelTicketPrintHook,
  },
  async (
    { orderItemId, reason },
    { supabase },
  ): Promise<ActionResult<{ autoCancelledOrder: boolean }>> => {
    const { data, error } = await supabase.rpc("void_order_item", {
      p_order_item_id: orderItemId,
      p_reason: reason,
    });

    if (error) {
      return mapRpcError<{ autoCancelledOrder: boolean }>(
        error,
        voidRpcMappings,
        voidRpcFallback,
      );
    }

    const rpcResult = data as unknown as {
      auto_cancelled_order?: boolean;
      was_sent_to_kitchen?: boolean;
    } | null;

    // `wasSentToKitchen` rides on `meta` (not `data`) because callers do not
    // need it — only the `afterSuccess` hook reads it to decide whether the
    // cancel-ticket print should fire. Keeping internal state out of `data`
    // preserves the operator-facing API surface.
    return {
      success: true,
      data: { autoCancelledOrder: rpcResult?.auto_cancelled_order === true },
      meta: { wasSentToKitchen: rpcResult?.was_sent_to_kitchen === true },
    };
  },
);

/* ─── reduceOrderItemQuantity ─── */

/**
 * Reduce a single kitchen-sent order item's quantity with audit reason.
 *
 * Migrated to `withActionPositional` in WS-1b (2026-05-27). Same template
 * as `voidOrderItem`: positional args via `argsToInput`, composite auth
 * via `posVoidAuth`, RPC error map via `reduceRpcMappings` + fallback,
 * partial-cancel kitchen ticket via `afterSuccess` hook
 * (`enqueuePartialCancelTicketPrintHook`).
 *
 * Result shape change vs pre-WS-1b:
 *   - `data.qtyReduced / oldQuantity / newQuantity` UNCHANGED
 *   - `data.printWarning` REMOVED — print warning now lives on
 *     `result.meta.warning` (set by the afterSuccess hook). The caller
 *     `order-detail-sheet.tsx` was updated in the same commit.
 */
export const reduceOrderItemQuantity = withActionPositional(
  {
    argsToInput: (orderItemId: number, newQuantity: number, reason: string) => ({
      orderItemId,
      newQuantity,
      reason,
    }),
    schema: reduceItemSchema,
    customAuth: posVoidAuth,
    afterSuccess: enqueuePartialCancelTicketPrintHook,
  },
  async (
    { orderItemId, newQuantity, reason },
    { supabase },
  ): Promise<
    ActionResult<{
      qtyReduced: number;
      oldQuantity: number;
      newQuantity: number;
    }>
  > => {
    const { data, error } = await supabase.rpc("reduce_order_item_quantity", {
      p_order_item_id: orderItemId,
      p_new_quantity: newQuantity,
      p_reason: reason,
    });

    if (error) {
      return mapRpcError(error, reduceRpcMappings, reduceRpcFallback);
    }

    const rpcResult = data as unknown as {
      order_id: number;
      order_item_id: number;
      old_quantity: number;
      new_quantity: number;
      qty_reduced: number;
      was_sent_to_kitchen?: boolean;
    } | null;

    if (!rpcResult) {
      return {
        success: false,
        error: "Không thể giảm SL món. Vui lòng thử lại.",
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
    }

    // `wasSentToKitchen` rides on `meta` — internal signal for the hook,
    // not part of the caller-facing API.
    return {
      success: true,
      data: {
        qtyReduced: rpcResult.qty_reduced,
        oldQuantity: rpcResult.old_quantity,
        newQuantity: rpcResult.new_quantity,
      },
      meta: { wasSentToKitchen: rpcResult.was_sent_to_kitchen === true },
    };
  },
);

/* ─── editPendingOrderItem ─── */

/**
 * Sửa món đã gửi (variant/topping/sides/note/qty/unit_price) khi
 * `order_items.status='pending'` — chef chưa bắt đầu nấu. Cashier dùng
 * primitive này để fix nhầm size/topping NGAY sau "Gửi đơn" mà không phải
 * huỷ + thêm món (bị split audit + 2 phiếu bếp).
 *
 * Server không re-fetch giá từ menu — `unit_price` do client compute (mirror
 * create_order/append_order_items) để giá đã thoả thuận khách lock-in.
 * RPC vẫn validate menu_item active + variant active để chặn edit-after-disable.
 *
 * Nếu số lượng đổi sau khi phiếu bếp đã in, enqueue thêm một phiếu delta:
 * tăng SL dùng kitchen_ticket/GỌI THÊM; giảm SL dùng cancel_ticket. Các edit
 * khác vẫn chỉ bump KDS realtime và nhắc cashier báo bếp thủ công.
 *
 * Migrated to `withActionPositional` in WS-1b (2026-05-27).
 * Result shape vs pre-WS-1b: UNCHANGED. Print logic stays in the handler
 * (not in an `afterSuccess` hook) because `quantityPrintQueued` is a
 * data-level outcome the caller branches on — `afterSuccess` only returns
 * `{ warning? }`, which would lose that signal. The caller
 * `pos-desktop-shell.tsx` reads all three (`printWarning`,
 * `quantityPrintQueued`, `wasSentToKitchen`) from `r.data`, so we keep them
 * there.
 */
export const editPendingOrderItem = withActionPositional(
  {
    argsToInput: (
      orderItemId: number,
      input: Omit<EditPendingOrderItemInput, "orderItemId">,
    ) => ({ orderItemId, ...input }),
    schema: editPendingItemSchema,
    customAuth: posVoidAuth,
  },
  async (
    parsedData,
    { supabase },
  ): Promise<
    ActionResult<{
      oldQuantity: number;
      newQuantity: number;
      wasSentToKitchen: boolean;
      quantityPrintQueued: boolean;
      printWarning?: string;
    }>
  > => {
    const trimmedNote = parsedData.note?.trim();
    const noteOrNull =
      typeof trimmedNote === "string" && trimmedNote.length > 0
        ? trimmedNote
        : null;
    const variantNameOrNull =
      parsedData.variantName != null && parsedData.variantName.length > 0
        ? parsedData.variantName
        : null;

    // RPC accepts JSONB — pass plain JS objects, supabase-js serializes.
    const rpcModifiers = parsedData.modifiers.map((m) => ({
      modifier_id: m.modifier_id,
      name: m.name,
      price: m.price,
    }));
    const rpcSides = parsedData.sides.map((s) => ({
      side_item_id: s.side_item_id,
      name: s.name,
      price: s.price,
      quantity: s.quantity,
      is_default: s.is_default,
    }));

    // RPC types not yet regenerated (migration pending owner apply per
    // CLAUDE.md: dev/test push OK, production file→PR→merge→manual apply →
    // pnpm db:types). Cast mirrors existing pattern in menu-actions.ts for
    // get_branch_menu_daily_limits_for_pos. After owner applies + db:types,
    // remove the cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "edit_pending_order_item",
      {
        p_order_item_id: parsedData.orderItemId,
        p_variant_id: parsedData.variantId,
        p_variant_name: variantNameOrNull,
        p_unit_price: parsedData.unitPrice,
        p_modifiers: rpcModifiers,
        p_sides: rpcSides,
        p_note: noteOrNull,
        p_quantity: parsedData.quantity,
      },
    );

    if (error) {
      return mapRpcError(error, editRpcMappings, editRpcFallback);
    }

    const result = data as unknown as {
      old_quantity: number;
      new_quantity: number;
      was_sent_to_kitchen?: boolean;
    } | null;

    if (!result) {
      return {
        success: false,
        error: "Không thể sửa món. Vui lòng thử lại.",
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
    }

    let printWarning: string | undefined;
    let quantityPrintQueued = false;
    const wasSentToKitchen = result.was_sent_to_kitchen === true;
    const quantityChanged = result.old_quantity !== result.new_quantity;

    if (wasSentToKitchen && quantityChanged) {
      const { data: printData, error: printError } =
        await // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("enqueue_edit_pending_order_item_quantity_print", {
          p_order_item_id: parsedData.orderItemId,
          p_old_quantity: result.old_quantity,
          p_new_quantity: result.new_quantity,
          p_reason: "Sua so luong mon",
        });

      if (printError) {
        printWarning = editPrintErrorToWarning(printError.message);
      } else {
        const payload = printData as {
          skipped?: boolean;
          reason?: string;
          job_id?: number | null;
        } | null;
        const skipReason = payload?.skipped ? payload.reason : undefined;
        const skipWarning = editPrintSkipReasonToWarning(skipReason);
        if (skipWarning) {
          printWarning = skipWarning;
        } else if (
          skipReason === "not_sent" ||
          skipReason === "no_quantity_change"
        ) {
          quantityPrintQueued = false;
        } else {
          quantityPrintQueued = typeof payload?.job_id === "number";
        }
      }
    }

    return {
      success: true,
      data: {
        oldQuantity: result.old_quantity,
        newQuantity: result.new_quantity,
        wasSentToKitchen,
        quantityPrintQueued,
        printWarning,
      },
    };
  },
);

/**
 * Toggle priority flag on an order. Auth: POS_USE. Migrated to
 * `withActionPositional` in WS-1b batch 2 (2026-05-27). `mapPriorityError`
 * lives in `_lib/messages.ts` so the internal `markInitialOrderPriority`
 * helper at the top of this file can reuse it.
 */
export const setOrderPriority = withActionPositional(
  {
    argsToInput: (orderId: number, isPriority: boolean, note?: string) => ({
      id: orderId,
      isPriority,
      note,
    }),
    schema: priorityInputSchema,
    customAuth: posUseAuth,
  },
  async ({ id, isPriority, note }, { supabase }) => {
    const trimmedNote = note?.trim();
    const { error } = await supabase.rpc("set_pos_order_priority", {
      p_order_id: id,
      p_is_priority: isPriority,
      p_note: trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined,
    });
    if (error) {
      return {
        success: false,
        error: mapPriorityError(error.message, "order"),
      };
    }
    return { success: true };
  },
);

/**
 * Toggle priority flag on a single order item. Auth: POS_USE. Migrated to
 * `withActionPositional` in WS-1b batch 2 (2026-05-27).
 */
export const setOrderItemPriority = withActionPositional(
  {
    argsToInput: (orderItemId: number, isPriority: boolean, note?: string) => ({
      id: orderItemId,
      isPriority,
      note,
    }),
    schema: priorityInputSchema,
    customAuth: posUseAuth,
  },
  async ({ id, isPriority, note }, { supabase }) => {
    const trimmedNote = note?.trim();
    const { error } = await supabase.rpc("set_pos_order_item_priority", {
      p_order_item_id: id,
      p_is_priority: isPriority,
      p_note: trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined,
    });
    if (error) {
      return {
        success: false,
        error: mapPriorityError(error.message, "item"),
      };
    }
    return { success: true };
  },
);

/* ─── cancelOrder ─── */

/**
 * Cancel an entire order with audit reason. The RPC enqueues per-item
 * cancel tickets INSIDE its transaction; this action does not run a
 * follow-up print RPC. Per-item skip reasons come back as
 * `result.skip_reasons[]` and get reduced to a single operator toast by
 * `cancelSkipReasonsToWarning`.
 *
 * Migrated to `withActionPositional` in WS-1b (2026-05-27).
 * Result shape change vs pre-WS-1b:
 *   - `data.cancelTickets / cancelSkipped` UNCHANGED
 *   - `data.printWarning` REMOVED — warning now lives on
 *     `result.meta.warning`. Caller `order-detail-sheet.tsx` updated in
 *     the same commit.
 */
export const cancelOrder = withActionPositional(
  {
    argsToInput: (orderId: number, reason: string) => ({ orderId, reason }),
    schema: cancelOrderSchema,
    customAuth: posVoidAuth,
  },
  async (
    { orderId, reason },
    { supabase },
  ): Promise<
    ActionResult<{ cancelTickets: number; cancelSkipped: number }>
  > => {
    const { data, error } = await supabase.rpc("cancel_order", {
      p_order_id: orderId,
      p_reason: reason,
    });

    if (error) {
      return mapRpcError(error, cancelRpcMappings, cancelRpcFallback);
    }

    const rpcResult = data as unknown as {
      order_id?: number;
      status?: string;
      cancel_tickets?: number;
      cancel_skipped?: number;
      skip_reasons?: string[];
    } | null;

    const cancelSkipped = rpcResult?.cancel_skipped ?? 0;
    const warning = cancelSkipReasonsToWarning(
      cancelSkipped,
      rpcResult?.skip_reasons ?? [],
    );

    return {
      success: true,
      data: {
        cancelTickets: rpcResult?.cancel_tickets ?? 0,
        cancelSkipped,
      },
      meta: warning ? { warning } : undefined,
    };
  },
);

/* ─── transferOrderTable ─── */

/**
 * Move an order to a different table. Auth: POS_USE.
 * `idempotencyKey` is a per-click mint by the cashier UI — the RPC
 * dedupes on this so the network-flap retry case (server commits but
 * client times out, cashier taps again) returns the same response
 * rather than re-shuffling the order.
 *
 * Migrated to `withActionPositional` in WS-1b batch 2 (2026-05-27).
 */
export const transferOrderTable = withActionPositional(
  {
    argsToInput: (
      orderId: number,
      newTableId: number,
      idempotencyKey?: string,
    ) => ({ orderId, newTableId, idempotencyKey }),
    schema: transferTableSchema,
    customAuth: posUseAuth,
  },
  async (
    { orderId, newTableId, idempotencyKey },
    { supabase },
  ): Promise<ActionResult<{ idempotent?: boolean }>> => {
    const { data, error } = await supabase.rpc("transfer_order_table", {
      p_order_id: orderId,
      p_new_table_id: newTableId,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      return mapRpcError(error, transferRpcMappings, transferRpcFallback);
    }

    const result = data as { idempotent?: boolean } | null;
    return result?.idempotent
      ? { success: true, data: { idempotent: true } }
      : { success: true };
  },
);

/* ─── updateOrderStatus (POS) ─── */

/**
 * Transition order to `served`. POS only — KDS/kitchen drives the other
 * states. Schema enum locks the input to `served` so a buggy caller
 * cannot drive the order to `paid` or `completed` via this surface.
 *
 * Migrated to `withActionPositional` in WS-1b batch 2 (2026-05-27).
 */
export const updateOrderStatus = withActionPositional(
  {
    argsToInput: (orderId: number, newStatus: "served") => ({
      orderId,
      newStatus,
    }),
    schema: updateOrderStatusSchema,
    customAuth: posUseAuth,
  },
  async ({ orderId, newStatus }, { supabase }) => {
    const { error } = await supabase.rpc("update_pos_order_status", {
      p_order_id: orderId,
      p_new_status: newStatus,
    });
    if (error) {
      return mapRpcError(
        error,
        updateOrderStatusRpcMappings,
        updateOrderStatusRpcFallback,
      );
    }
    return { success: true, data: null };
  },
);

/* ─── markOrderItemServed (POS waiter per-item) ─── */

/**
 * Waiter confirmation that a single order item reached the table. RPC
 * enforces the `preparing|ready → served` transition.
 *
 * Migrated to `withActionPositional` in WS-1b batch 2 (2026-05-27).
 */
export const markOrderItemServed = withActionPositional(
  {
    argsToInput: (itemId: number) => ({ itemId }),
    schema: markOrderItemServedSchema,
    customAuth: posUseAuth,
  },
  async ({ itemId }, { supabase }) => {
    const { error } = await supabase.rpc("mark_order_item_served", {
      p_item_id: itemId,
    });
    if (error) {
      return mapRpcError(error, markServedRpcMappings, markServedRpcFallback);
    }
    return { success: true, data: null };
  },
);

/* ─── fetchOrderItemsForReorder ─── */

export async function fetchOrderItemsForReorder(orderId: number): Promise<
  ActionResult<{
    items: CartItem[];
    skippedCount: number;
    priceChangedCount: number;
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
    return {
      success: true,
      data: { items: [], skippedCount: 0, priceChangedCount: 0 },
    };
  }

  const variantIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.variant_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];

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

  // Parallel fetch: menu base prices, variant adjustments, modifier prices.
  // Trước đây chạy tuần tự ⇒ 3 round-trips; reorder chậm khi mạng lag. Three
  // queries không phụ thuộc nhau, an toàn để Promise.all → 1 wall-time RTT.
  const [menuRes, variantRes, modifierRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, is_active, base_price")
      .eq("tenant_id", claims.tenant_id)
      .in("id", menuIds),
    variantIds.length > 0
      ? supabase
          .from("menu_item_variants")
          .select("id, is_active, price_adjustment")
          .eq("tenant_id", claims.tenant_id)
          .in("id", variantIds)
      : Promise.resolve(null),
    modifierIds.length > 0
      ? supabase
          .from("menu_item_modifiers")
          .select("id, is_active, price")
          .eq("tenant_id", claims.tenant_id)
          .in("id", modifierIds)
      : Promise.resolve(null),
  ]);

  if (menuRes.error) {
    return { success: false, error: "Không thể kiểm tra thực đơn." };
  }
  if (variantRes && variantRes.error) {
    return { success: false, error: "Không thể kiểm tra biến thể thực đơn." };
  }
  if (modifierRes && modifierRes.error) {
    return { success: false, error: "Không thể kiểm tra tùy chọn thực đơn." };
  }

  const livePrices = new Map(
    (menuRes.data ?? [])
      .filter((m) => m.is_active === true)
      .map((m) => [m.id, Number(m.base_price)]),
  );

  const liveVariantAdj = new Map<number, number>();
  for (const v of variantRes?.data ?? []) {
    if (v.is_active === true) {
      liveVariantAdj.set(v.id, Number(v.price_adjustment ?? 0));
    }
  }

  const liveModifierPrices = new Map<number, number>();
  for (const m of modifierRes?.data ?? []) {
    if (m.is_active === true) {
      liveModifierPrices.set(m.id, Number(m.price ?? 0));
    }
  }

  const cartItems: CartItem[] = [];
  let skippedCount = 0;
  // Đếm dòng có chênh lệch giữa giá lưu trên `order_items.unit_price` (snapshot
  // lúc gửi bếp) và giá menu hiện tại (base + variant). Cashier cần biết để
  // không reorder mặc định mà bỏ qua giá đã đổi sau đó.
  let priceChangedCount = 0;

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

    const newUnitPrice = basePrice + variantAdj;
    if (Math.abs(newUnitPrice - Number(r.unit_price)) > 0.5) {
      priceChangedCount += 1;
    }

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
      unit_price: newUnitPrice,
      modifiers: liveMods,
      sides: liveSides,
      note: r.note ?? undefined,
    });
  }

  return {
    success: true,
    data: { items: cartItems, skippedCount, priceChangedCount },
  };
}
