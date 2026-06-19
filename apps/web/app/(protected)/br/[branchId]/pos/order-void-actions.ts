"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import { withActionPositional } from "@/_lib/with-action";
import { POS_ERROR_CODES } from "./_utils/error-codes";
import {
  cancelOrderSchema,
  editPendingItemSchema,
  reduceItemSchema,
  voidItemSchema,
} from "./_lib/schemas";
import type { EditPendingOrderItemInput } from "./_lib/schemas";
import { posVoidAuth } from "./_lib/auth";
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
  mapRpcError,
  reduceRpcFallback,
  reduceRpcMappings,
  voidRpcFallback,
  voidRpcMappings,
} from "./_lib/messages";

/* ─── voidOrderItem ─── */

/**
 * Void a single pending / kitchen-sent order item with audit reason.
 *
 * The non-fatal cancel-ticket print warning lives on `result.meta.warning`
 * (set by the `enqueueCancelTicketPrintHook` afterSuccess hook), not on
 * `data`.
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
 * The partial-cancel print warning lives on `result.meta.warning` (set by
 * the `enqueuePartialCancelTicketPrintHook` afterSuccess hook), not on
 * `data`.
 */
export const reduceOrderItemQuantity = withActionPositional(
  {
    argsToInput: (
      orderItemId: number,
      newQuantity: number,
      reason: string,
    ) => ({
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
 * Print logic stays in the handler
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

    const { data, error } = await supabase.rpc("edit_pending_order_item", {
      p_order_item_id: parsedData.orderItemId,
      // variant/note params accept NULL in plpgsql (item without variant / no
      // note) but typegen types them non-null (no SQL default) — assert to
      // satisfy the generated Args while keeping the other params checked.
      p_variant_id: parsedData.variantId as number,
      p_variant_name: variantNameOrNull as string,
      p_unit_price: parsedData.unitPrice,
      p_modifiers: rpcModifiers,
      p_sides: rpcSides,
      p_note: noteOrNull as string,
      p_quantity: parsedData.quantity,
    });

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
      const { data: printData, error: printError } = await supabase.rpc(
        "enqueue_edit_pending_order_item_quantity_print",
        {
          p_order_item_id: parsedData.orderItemId,
          p_old_quantity: result.old_quantity,
          p_new_quantity: result.new_quantity,
          p_reason: "Sua so luong mon",
        },
      );

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


/* ─── cancelOrder ─── */

/**
 * Cancel an entire order with audit reason. The RPC enqueues per-item
 * cancel tickets INSIDE its transaction; this action does not run a
 * follow-up print RPC. Per-item skip reasons come back as
 * `result.skip_reasons[]` and get reduced to a single operator toast by
 * `cancelSkipReasonsToWarning`.
 *
 * The skip warning lives on `result.meta.warning`, not on `data`.
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

