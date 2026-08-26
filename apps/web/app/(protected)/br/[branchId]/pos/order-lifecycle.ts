"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@comtammatu/shared/types";
import { withActionPositional } from "@/_lib/with-action";
import { calcItemDiscountAmount, calcItemSubtotal, getPosLineItemDisplayName } from "./types";
import type { CartState, CartItem } from "./types";
import { POS_ERROR_CODES } from "./_utils/error-codes";
import {
  appendOrderItemsSchema,
  markOrderItemServedSchema,
  releaseDailyLimitHoldsSchema,
  reserveDailyLimitHoldsSchema,
  submitOrderSchema,
} from "./_lib/schemas";
import { isPosBranchInScope, posUseAuth } from "./_lib/auth";
import { evaluateOrderPromotionsQuiet } from "@lib/promotions/evaluate-order";
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
    discount_type: item.discount_type ?? null,
    discount_value: item.discount_value ?? null,
    discount_note: item.discount_note ?? null,
  }));
}

/**
 * Sum of expected per-line discount across the cart, mirroring the server
 * `compute_discount_amount`. Used to verify the create/append RPC actually
 * applied the discounts — guards the window where web ships before the
 * inline-discount migration is live (old RPC silently drops the keys).
 */
function expectedItemDiscountTotal(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + calcItemDiscountAmount(item), 0);
}

const ITEM_DISCOUNT_NOT_APPLIED_WARNING =
  "Chiết khấu món chưa được áp dụng — kiểm tra lại hoặc dùng 'Chiết khấu món' trong chi tiết đơn.";

/**
 * Non-fatal warning when the RPC did not reflect the expected per-line
 * discount. `actual === undefined` means the RPC predates the inline-discount
 * migration (it dropped the keys); `actual < expected` means a partial/missed
 * apply. The +1 tolerates integer-rounding noise.
 */
function buildItemDiscountWarning(
  expected: number,
  actual: number | undefined,
): string | null {
  if (expected <= 0) return null;
  if (actual === undefined || actual + 1 < expected) {
    return ITEM_DISCOUNT_NOT_APPLIED_WARNING;
  }
  return null;
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
    if (!isPosBranchInScope(claims, branchId)) {
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
    if (!isPosBranchInScope(claims, branchId)) {
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
 * Per-input-field codes (`INPUT_INVALID_BRANCH` / `INPUT_INVALID_SESSION` /
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
    { supabase, claims, userId },
  ): Promise<ActionResult<{ order_id: number; order_number: string }>> => {
    // POS branch scope defence in depth keeps a distinct errorCode.
    if (!isPosBranchInScope(claims, branchId)) {
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

    const deliveryRpcArgs =
      cart.order_type === "delivery"
        ? {
            p_delivery_platform: cart.delivery_platform ?? undefined,
            p_external_order_ref: cart.external_order_ref ?? undefined,
          }
        : {};

    const { data, error } =
      dailyLimitHoldToken !== undefined
        ? await supabase.rpc("create_order_with_daily_limit_hold", {
            p_tenant_id: claims.tenant_id,
            p_branch_id: branchId,
            p_created_by: userId,
            p_items: rpcItems,
            p_order_type: cart.order_type,
            p_table_id: cart.table_id ?? undefined,
            p_pos_session_id: posSessionId ?? undefined,
            p_note: cart.note ?? undefined,
            p_idempotency_key: idempotencyKey ?? undefined,
            p_daily_limit_hold_token: dailyLimitHoldToken,
            ...deliveryRpcArgs,
          })
        : await supabase.rpc("create_order", {
            p_tenant_id: claims.tenant_id,
            p_branch_id: branchId,
            p_created_by: userId,
            p_items: rpcItems,
            p_order_type: cart.order_type,
            p_table_id: cart.table_id ?? undefined,
            p_pos_session_id: posSessionId ?? undefined,
            p_note: cart.note ?? undefined,
            p_idempotency_key: idempotencyKey ?? undefined,
            ...deliveryRpcArgs,
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
      item_discount_amount?: number;
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

    const discountWarning = buildItemDiscountWarning(
      expectedItemDiscountTotal(cart.items),
      result.item_discount_amount,
    );

    await evaluateOrderPromotionsQuiet(supabase, result.order_id);

    return {
      success: true,
      data: { order_id: result.order_id, order_number: result.order_number },
      meta: {
        prioritySet: cart.is_priority === true && priorityWarning === null,
        ...(priorityWarning ? { priorityWarning } : {}),
        ...(discountWarning ? { discountWarning } : {}),
      },
    };
  },
);


/* ─── appendOrderItems ─── */

/**
 * Append more items to an existing pending order. Same pattern as
 * `submitOrder` but targets `append_order_items` RPC; no priority/print
 * follow-up needed.
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
      discountWarning?: string;
    }>
  > => {
    if (!isPosBranchInScope(claims, branchId)) {
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
      item_discount_amount?: number;
      idempotent?: boolean;
    } | null;

    if (!result) {
      return {
        success: false,
        error: "Không thể thêm món. Vui lòng thử lại.",
        errorCode: POS_ERROR_CODES.RPC_GENERIC,
      };
    }

    // An idempotent replay added nothing this call, so there is no discount to
    // verify against — only check on a real append.
    const discountWarning =
      result.idempotent === true
        ? null
        : buildItemDiscountWarning(
            expectedItemDiscountTotal(items),
            result.item_discount_amount,
          );

    if (result.idempotent !== true) {
      await evaluateOrderPromotionsQuiet(supabase, result.order_id);
    }

    return {
      success: true,
      data: {
        order_id: result.order_id,
        subtotal: Number(result.subtotal),
        total_amount: Number(result.total_amount),
        added_count: Number(result.added_count),
        ...(result.idempotent ? { idempotent: true } : {}),
        ...(discountWarning ? { discountWarning } : {}),
      },
    };
  },
);


/* ─── markOrderItemServed (POS per-item) ─── */

/**
 * Waiter confirmation that a single order item reached the table. RPC
 * enforces the `preparing|ready → served` transition.
 */
export const markOrderItemServed = withActionPositional(
  {
    argsToInput: (branchId: number, itemId: number) => ({ branchId, itemId }),
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
