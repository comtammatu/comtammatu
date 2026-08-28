"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import {
  getVNBusinessDateString,
  getVNBusinessDayUtcRange,
} from "@comtammatu/shared/time";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission, probePermission } from "../../_lib/auth";
import { withActionPositional } from "@/_lib/with-action";
import type { CartItem } from "./types";
import {
  isPosBranchInScope,
  isPosOrderCancelRole,
  posUseAuth,
} from "./_lib/auth";

/* ─── Constants ─── */

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

/* ─── Input Schemas ─── */

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Mã chi nhánh không hợp lệ" });

const sessionIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Mã ca không hợp lệ" });

const orderIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Mã đơn hàng không hợp lệ" });

/* ─── fetchActiveOrders ─── */

// Widened to mirror SessionOrder so realtime applyOrderUpdate can patch all
// fields the cashier UI reads (totals, discount metadata, merge/split refs).
// Adding fields here is REQUIRED before dropping post-mutation refetch — list
// pane and detail-sheet headers both consume these for in-place updates.
const ORDER_LIST_SELECT = `
  id,
  order_number,
  order_type,
  delivery_platform,
  external_order_ref,
  status,
  payment_status,
  payment_method,
  subtotal,
  tax_amount,
  service_charge,
  discount_amount,
  order_discount_amount,
  item_discount_amount,
  discount_type,
  discount_value,
      discount_note,
      promotion_id,
      promotion_code_id,
      is_priority,
  total_amount,
  table_id,
  note,
  merged_into_order_id,
  split_from_order_id,
  created_at,
  updated_at,
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
const fetchActiveOrdersSchema = z.object({ branchId: branchIdSchema });

export const fetchActiveOrders = withActionPositional(
  {
    argsToInput: (branchId: number) => ({ branchId }),
    schema: fetchActiveOrdersSchema,
    customAuth: posUseAuth,
  },
  async ({ branchId }, { supabase, claims }): Promise<ActionResult> => {
    if (!isPosBranchInScope(claims, branchId)) {
      return { success: false, error: "Không có quyền truy cập chi nhánh này" };
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select(ORDER_LIST_SELECT)
      .eq("branch_id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .in("status", ["new", "confirmed", "preparing", "ready", "served"])
      .neq("payment_status", "paid")
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: messages.pos.order.loadFailed };
    }

    return { success: true, data: orders ?? [] };
  },
);

/* ─── fetchArchivedOrders ─── */

const archivedCursorSchema = z
  .object({
    archivedAt: z.string().min(1, { error: "Cursor không hợp lệ" }),
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
  // Prefix ≤40 + space + 12-char suffix; leave headroom for pasted memos.
  q: z.string().trim().max(80).optional(),
});

/**
 * Paginated lookup of archived (paid / cancelled) orders for the POS
 * sidebar's "Đã xử lý" sheet. Keyset cursor on `(updated_at desc, id desc)`
 * so the newest archived transition appears first, not the newest order number.
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
    nextCursor: { archivedAt: string; id: number } | null;
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

  if (!isPosBranchInScope(claims, parsed.data.branchId)) {
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
  } else {
    const businessDay = getVNBusinessDateString();
    const { startIso, endIso } = getVNBusinessDayUtcRange(businessDay);
    query = query.gte("created_at", startIso).lt("created_at", endIso);
  }

  if (typeof q === "string" && q.length > 0) {
    // ILIKE substring match on order_number OR payment_code. Cashiers usually
    // cite the last digits of the order; reverse lookup from a VietQR transfer
    // memo uses payment_code (prefix + space + suffix). Strip PostgREST
    // reserved chars so the or-list cannot be injected. Quote the pattern so
    // spaces inside payment codes stay inside one filter value.
    const safeQ = q.replace(/[(),."]/g, "");
    if (safeQ.length > 0) {
      const pattern = `%${safeQ}%`;
      query = query.or(
        `order_number.ilike."${pattern}",payment_code.ilike."${pattern}"`,
      );
    }
  }

  if (cursor !== undefined && cursor !== null) {
    // Keyset: rows STRICTLY after the cursor under (updated_at desc, id desc).
    // i.e. (updated_at, id) < (cursor.archivedAt, cursor.id) lexicographically.
    // PostgREST cannot express composite "<" directly, so we OR two
    // disjoint half-spaces:
    //   updated_at < cursor.archivedAt
    //   OR (updated_at = cursor.archivedAt AND id < cursor.id)
    query = query.or(
      `updated_at.lt.${cursor.archivedAt},and(updated_at.eq.${cursor.archivedAt},id.lt.${String(cursor.id)})`,
    );
  }

  // Fetch pageSize+1 to probe nextCursor without a separate count round-trip.
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (error) {
    return { success: false, error: messages.pos.archivedOrders.loadFailed };
  }

  const fetched = (data ?? []) as Array<{
    id: number;
    updated_at: string;
    [k: string]: unknown;
  }>;
  const hasMore = fetched.length > pageSize;
  const rows = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = rows.at(-1);
  const nextCursor =
    hasMore && last !== undefined
      ? { archivedAt: last.updated_at, id: last.id }
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
    canCancelOrder: boolean;
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

  if (!isPosBranchInScope(claims, parsed.data.branchId)) {
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
      delivery_platform,
      external_order_ref,
      status,
      payment_status,
      payment_method,
      subtotal,
      tax_amount,
      service_charge,
      discount_amount,
      order_discount_amount,
      item_discount_amount,
      discount_type,
      discount_value,
      discount_note,
      promotion_id,
      promotion_code_id,
      total_amount,
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
        discount_amount,
        discount_type,
        discount_value,
        discount_note,
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
      error: messages.pos.order.loadFailed,
    };
  }

  if (data === null) return { success: true, data: null };

  return {
    success: true,
    data: {
      order: data,
      canManageOrders,
      canCancelOrder:
        canManageOrders && isPosOrderCancelRole(claims.user_role),
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
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
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
      delivery_platform,
      external_order_ref,
      status,
      payment_status,
      payment_method,
      subtotal,
      tax_amount,
      service_charge,
      discount_amount,
      order_discount_amount,
      item_discount_amount,
      discount_type,
      discount_value,
      discount_note,
      promotion_id,
      promotion_code_id,
      total_amount,
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
        discount_amount,
        discount_type,
        discount_value,
        discount_note,
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
      error: messages.pos.order.loadFailed,
    };
  }

  return { success: true, data: order };
}

/* ─── fetchOrderDetail — POS sheet (items + status) ─── */

const fetchOrderDetailSchema = z.object({ orderId: orderIdSchema });

export const fetchOrderDetail = withActionPositional(
  {
    argsToInput: (orderId: number) => ({ orderId }),
    schema: fetchOrderDetailSchema,
    customAuth: posUseAuth,
  },
  async (
    { orderId },
    ctx,
  ): Promise<
    ActionResult<{
      order: Record<string, unknown>;
      canManageOrders: boolean;
      canCancelOrder: boolean;
      canVoidPaidOrder: boolean;
      canApplyDiscount: boolean;
    }>
  > => {
    const { supabase, claims } = ctx;

    let detailQuery = supabase
      .from("orders")
      .select(
        `
      id,
      order_number,
      order_type,
      delivery_platform,
      external_order_ref,
      status,
      payment_status,
      payment_method,
      subtotal,
      tax_amount,
      service_charge,
      discount_amount,
      order_discount_amount,
      item_discount_amount,
      discount_type,
      discount_value,
      discount_note,
      promotion_id,
      promotion_code_id,
      total_amount,
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
        discount_amount,
        discount_type,
        discount_value,
        discount_note,
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
      .eq("id", orderId)
      .eq("tenant_id", claims.tenant_id);

    // Branch-scoped users can only view their own branch's orders
    if (claims.branch_id) {
      detailQuery = detailQuery.eq("branch_id", claims.branch_id);
    }

    // Parallelize: data SELECT + void-permission probe (UI hint only).
    // Probe reuses the same supabase client → skips a 2nd getUser() HTTP
    // round-trip + getSession() cookie parse. Server-side void/cancel RPCs
    // remain the authoritative gate; hint=false on probe error is fail-safe.
    const [
      { data: order, error },
      canManageOrders,
      canVoidPaidDirect,
      canUsePos,
      canApplyDiscount,
    ] = await Promise.all([
      detailQuery.single(),
      probePermission(ctx, PERMISSION_KEYS.POS_VOID_ORDER, claims.branch_id),
      probePermission(
        ctx,
        PERMISSION_KEYS.POS_VOID_PAID_ORDER,
        claims.branch_id,
      ),
      // Cashiers without void_paid may still enqueue a leader/BM approval
      // request (ADR 0023).
      probePermission(ctx, PERMISSION_KEYS.POS_USE, claims.branch_id),
      probePermission(
        ctx,
        PERMISSION_KEYS.POS_APPLY_DISCOUNT,
        claims.branch_id,
      ),
    ]);
    const canVoidPaidOrder = canVoidPaidDirect || canUsePos;

    if (error) {
      if (error.code === "PGRST116") {
        return { success: false, error: "Không tìm thấy đơn hàng" };
      }
      return {
        success: false,
        error: messages.pos.order.loadFailed,
      };
    }

    return {
      success: true,
      data: {
        order: order as unknown as Record<string, unknown>,
        canManageOrders,
        canCancelOrder:
          canManageOrders && isPosOrderCancelRole(claims.user_role),
        canVoidPaidOrder,
        canApplyDiscount,
      },
    };
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
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
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
      error: messages.pos.order.reorderLoadFailed,
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
  // The three queries are independent, so Promise.all collapses what used
  // to be 3 sequential round-trips into 1 wall-time RTT.
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
  // Count rows where the stored `order_items.unit_price` (snapshot at send
  // time) differs from the current menu price (base + variant). The cashier
  // must see this so a default reorder doesn't silently skip price changes.
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
