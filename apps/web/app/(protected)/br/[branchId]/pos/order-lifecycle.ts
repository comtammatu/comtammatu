"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@comtammatu/shared/types";
import { withActionPositional } from "@/_lib/with-action";
import { calcItemSubtotal, getPosLineItemDisplayName } from "./types";
import type { CartState, CartItem } from "./types";
import { POS_ERROR_CODES } from "./_utils/error-codes";
import {
  appendOrderItemsSchema,
  markOrderItemServedSchema,
  releaseDailyLimitHoldsSchema,
  reserveDailyLimitHoldsSchema,
  submitOrderSchema,
  updateOrderStatusSchema,
} from "./_lib/schemas";
import { posUseAuth } from "./_lib/auth";
import {
  appendOrderItemsRpcFallback,
  appendOrderItemsRpcMappings,
  dailyLimitHoldRpcFallback,
  dailyLimitHoldRpcMappings,
  mapDailyLimitRpcError,
  mapPriorityError,
  mapRpcError,
  markServedRpcFallback,
  markServedRpcMappings,
  submitOrderRpcFallback,
  submitOrderRpcMappings,
  type DailyLimitItemLabel,
  updateOrderStatusRpcFallback,
  updateOrderStatusRpcMappings,
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

function cartItemsToRpcItems(items: CartItem[]) {
  return items.map((item) => ({
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
}

function cartItemsToDailyLimitItemLabels(
  items: readonly CartItem[],
): DailyLimitItemLabel[] {
  const labels: DailyLimitItemLabel[] = [];
  const seen = new Set<number>();

  function addLabel(menuItemId: number, label: string): void {
    if (seen.has(menuItemId)) return;
    seen.add(menuItemId);
    labels.push({ menuItemId, label });
  }

  for (const item of items) {
    addLabel(item.menu_item_id, getPosLineItemDisplayName(item));

    for (const side of item.sides) {
      addLabel(side.side_item_id, side.name);
    }
  }

  return labels;
}

export const reserveDailyLimitHolds = withActionPositional(
  {
    argsToInput: (
      branchId: number,
      holdToken: string,
      items: CartItem[],
      source: "pos_cart" | "pos_append",
    ) => ({ branchId, holdToken, items, source }),
    schema: reserveDailyLimitHoldsSchema,
    customAuth: posUseAuth,
    validationErrorCode: POS_ERROR_CODES.INPUT_INVALID_CART,
    forbiddenErrorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
  },
  async (
    { branchId, holdToken, items, source },
    { supabase, claims },
  ): Promise<
    ActionResult<{
      hold_token: string;
      expires_at?: string;
      ttl_seconds?: number;
      released_count?: number;
      items?: unknown[];
    }>
  > => {
    if (claims.branch_id !== branchId) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
        errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
      };
    }

    const { data, error } = await supabase.rpc(
      "reserve_branch_menu_daily_holds",
      {
        p_branch_id: branchId,
        p_hold_token: holdToken,
        p_items: cartItemsToRpcItems(items),
        p_source: source,
      },
    );

    if (error) {
      return mapDailyLimitRpcError(
        error,
        cartItemsToDailyLimitItemLabels(items),
        dailyLimitHoldRpcMappings,
        dailyLimitHoldRpcFallback,
      );
    }

    return {
      success: true,
      data: (data ?? { hold_token: holdToken }) as {
        hold_token: string;
        expires_at?: string;
        ttl_seconds?: number;
        released_count?: number;
        items?: unknown[];
      },
    };
  },
);

export const releaseDailyLimitHolds = withActionPositional(
  {
    argsToInput: (branchId: number, holdToken: string) => ({
      branchId,
      holdToken,
    }),
    schema: releaseDailyLimitHoldsSchema,
    customAuth: posUseAuth,
    validationErrorCode: POS_ERROR_CODES.INPUT_INVALID_CART,
    forbiddenErrorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
  },
  async (
    { branchId, holdToken },
    { supabase, claims },
  ): Promise<ActionResult<{ hold_token: string; released_count?: number }>> => {
    if (claims.branch_id !== branchId) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
        errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
      };
    }

    const { data, error } = await supabase.rpc(
      "release_branch_menu_daily_holds",
      {
        p_branch_id: branchId,
        p_hold_token: holdToken,
      },
    );

    if (error) {
      return mapRpcError(
        error,
        dailyLimitHoldRpcMappings,
        dailyLimitHoldRpcFallback,
      );
    }

    return {
      success: true,
      data: (data ?? { hold_token: holdToken }) as {
        hold_token: string;
        released_count?: number;
      },
    };
  },
);

/* ─── submitOrder ─── */

/**
 * Submit a new order from the POS cart. Calls the `create_order` RPC which
 * atomically creates order + items + status history.
 *
 * Migrated to `withActionPositional` in WS-1b batch 3 (2026-05-28). Helper
 * extensions (`validationErrorCode`, `forbiddenErrorCode`, code-based
 * `mapRpcError` predicates) landed alongside so submitOrder's stable
 * errorCode catalogue is preserved. Per-input-field codes
 * (`INPUT_INVALID_BRANCH` / `INPUT_INVALID_SESSION` /
 * `INPUT_INVALID_IDEMPOTENCY`) intentionally collapse to
 * `INPUT_INVALID_CART` at the helper layer — none are members of
 * `RETRYABLE_POS_ERROR_CODES`, so client retry logic is unaffected. The
 * Vietnamese message stays specific via the Zod schema's per-field error.
 *
 * `SCOPE_BRANCH_MISMATCH` and `CART_EMPTY` codes are kept by checking
 * inside the handler — those are defence-in-depth + state-level errors
 * the client surfaces differently from a generic auth failure.
 */
export const submitOrder = withActionPositional(
  {
    argsToInput: (
      branchId: number,
      cart: CartState,
      posSessionId?: number,
      idempotencyKey?: string,
      dailyLimitHoldToken?: string,
    ) => ({
      branchId,
      cart,
      posSessionId,
      idempotencyKey,
      dailyLimitHoldToken,
    }),
    schema: submitOrderSchema,
    customAuth: posUseAuth,
    validationErrorCode: POS_ERROR_CODES.INPUT_INVALID_CART,
    forbiddenErrorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
  },
  async (
    { branchId, cart, posSessionId, idempotencyKey, dailyLimitHoldToken },
    { supabase, claims, user },
  ): Promise<ActionResult<{ order_id: number; order_number: string }>> => {
    // JWT branch_id defence in depth (proxy already routes by branch, but
    // a manipulated request reaching here gets a distinct errorCode).
    if (claims.branch_id !== branchId) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
        errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
      };
    }

    // Empty-cart guard with a distinct typed code. Zod cartStateSchema does
    // NOT enforce min(1) on items (the schema is reused for in-progress
    // edits where the cart can be momentarily empty); this action enforces
    // it explicitly so submit cannot fire a 0-item RPC.
    if (cart.items.length === 0) {
      return {
        success: false,
        error: "Giỏ hàng trống",
        errorCode: POS_ERROR_CODES.CART_EMPTY,
      };
    }

    const rpcItems = cartItemsToRpcItems(cart.items);

    const { data, error } =
      dailyLimitHoldToken !== undefined
        ? await supabase.rpc("create_order_with_daily_limit_hold", {
            p_tenant_id: claims.tenant_id,
            p_branch_id: branchId,
            p_created_by: user.id,
            p_items: rpcItems,
            p_order_type: cart.order_type,
            p_table_id: cart.table_id ?? undefined,
            p_pos_session_id: posSessionId ?? undefined,
            p_note: cart.note ?? undefined,
            p_idempotency_key: idempotencyKey ?? undefined,
            p_daily_limit_hold_token: dailyLimitHoldToken,
          })
        : await supabase.rpc("create_order", {
            p_tenant_id: claims.tenant_id,
            p_branch_id: branchId,
            p_created_by: user.id,
            p_items: rpcItems,
            p_order_type: cart.order_type,
            p_table_id: cart.table_id ?? undefined,
            p_pos_session_id: posSessionId ?? undefined,
            p_note: cart.note ?? undefined,
            p_idempotency_key: idempotencyKey ?? undefined,
          });

    if (error) {
      return mapDailyLimitRpcError(
        error,
        cartItemsToDailyLimitItemLabels(cart.items),
        submitOrderRpcMappings,
        submitOrderRpcFallback,
      );
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
      cart.is_priority === true
        ? await markInitialOrderPriority(supabase, result.order_id)
        : null;

    return {
      success: true,
      data: { order_id: result.order_id, order_number: result.order_number },
      meta: {
        prioritySet: cart.is_priority === true && priorityWarning === null,
        ...(priorityWarning ? { priorityWarning } : {}),
      },
    };
  },
);


/* ─── appendOrderItems ─── */

/**
 * Append more items to an existing pending order. Same pattern as
 * `submitOrder` but targets `append_order_items` RPC; no priority/print
 * follow-up needed.
 *
 * Migrated to `withActionPositional` in WS-1b batch 3 (2026-05-28).
 */
export const appendOrderItems = withActionPositional(
  {
    argsToInput: (
      branchId: number,
      orderId: number,
      items: CartItem[],
      idempotencyKey?: string,
      dailyLimitHoldToken?: string,
    ) => ({
      branchId,
      orderId,
      items,
      idempotencyKey,
      dailyLimitHoldToken,
    }),
    schema: appendOrderItemsSchema,
    customAuth: posUseAuth,
    forbiddenErrorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
  },
  async (
    { branchId, orderId, items, idempotencyKey, dailyLimitHoldToken },
    { supabase, claims },
  ): Promise<
    ActionResult<{
      order_id: number;
      subtotal: number;
      total_amount: number;
      added_count: number;
      idempotent?: boolean;
    }>
  > => {
    if (claims.branch_id !== branchId) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
        errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
      };
    }

    const rpcItems = cartItemsToRpcItems(items);

    const { data, error } =
      dailyLimitHoldToken !== undefined
        ? await supabase.rpc("append_order_items_with_daily_limit_hold", {
            p_order_id: orderId,
            p_items: rpcItems,
            p_idempotency_key: idempotencyKey ?? undefined,
            p_daily_limit_hold_token: dailyLimitHoldToken,
          })
        : await supabase.rpc("append_order_items", {
            p_order_id: orderId,
            p_items: rpcItems,
            p_idempotency_key: idempotencyKey ?? undefined,
          });

    if (error) {
      return mapDailyLimitRpcError(
        error,
        cartItemsToDailyLimitItemLabels(items),
        appendOrderItemsRpcMappings,
        appendOrderItemsRpcFallback,
      );
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
      return {
        success: false,
        error: "Không thể thêm món. Vui lòng thử lại.",
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
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
