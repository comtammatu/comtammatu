"use server";

import type { ActionResult } from "@comtammatu/shared/types";
import { withActionPositional } from "@/_lib/with-action";
import { priorityInputSchema, transferTableSchema } from "./_lib/schemas";
import { posUseAuth } from "./_lib/auth";
import {
  mapPriorityError,
  mapRpcError,
  transferRpcFallback,
  transferRpcMappings,
} from "./_lib/messages";

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

