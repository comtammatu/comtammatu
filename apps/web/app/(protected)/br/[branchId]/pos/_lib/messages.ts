/**
 * POS RPC error → user message mappings, plus the `afterSuccess` side-effect
 * hooks composed into POS server actions.
 *
 * One module per route family per the WS-1a template: the **mechanism**
 * lives in `apps/web/app/_lib/rpc-error-map.ts`, the **vocabulary** lives
 * here. Authors compose `readonly RpcErrorMapping[]` literals and pass them
 * into `mapRpcError`. New vocabularies accrete as WS-1b migrates the rest
 * of `order-actions.ts` + `payment-actions.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  includesAny,
  mapRpcError,
  type RpcErrorFallback,
  type RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import type { AfterSuccessHook } from "@/_lib/with-action";
import { POS_ERROR_CODES } from "../_utils/error-codes";
import type { VoidItemInput } from "./schemas";

/* ────────────────────────────────────────────────────────────────────────── */
/*  voidOrderItem — main RPC error vocabulary                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("void_order_item", ...)` failures. Order:
 * most-specific first. Predicates see the already-lowercased message
 * (mapRpcError lowercases once upstream).
 *
 * Behaviour preserved exactly from the pre-WS-1a hand-rolled `if`-chain:
 * - `"forbidden"`     → 42501 from the RPC's `has_permission` gate
 * - `"voidable"`      → "item not voidable in current state" — already
 *                       cancelled / served path
 * - `"served"`        → some RPC variants raise `"served items cannot be
 *                       voided"` instead; same user-facing meaning
 * Anything else falls through to `voidRpcFallback` ("Không thể hủy món.").
 */
export const voidRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("forbidden"),
    errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    userMessage: "Cần quyền hủy đơn POS để hủy món.",
  },
  {
    match: includesAny("voidable", "served"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Không thể hủy món đã phục vụ hoặc đã hủy.",
  },
];

export const voidRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể hủy món. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  enqueue_cancel_ticket_print — print error / skip-reason vocabularies      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Map the cancel-ticket print RPC's `error.message` into the operator-facing
 * warning string. Print failure is non-fatal — the void itself is already
 * committed; surface as a toast warning, not an action error.
 *
 * Mirrors the pre-WS-1a `if`-chain inside `voidOrderItem`. Kept as a free
 * function (not via `mapRpcError`) because the desired output is a plain
 * warning string, not an `ActionResult`.
 */
function printErrorToWarning(message: string | null | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("permission denied")) {
    return "Đã hủy món. Không có quyền in phiếu hủy — báo bếp thủ công.";
  }
  if (msg.includes("tenant mismatch")) {
    return "Đã hủy món. Lỗi quyền tenant khi in phiếu hủy.";
  }
  return "Đã hủy món. Không in được phiếu hủy — kiểm tra máy in bếp.";
}

/**
 * RPC may return `{skipped: true, reason: 'no_slot'|'no_printer'|...}` when
 * the item exists but the cancel ticket cannot be routed (drink with no
 * kitchen slot, kitchen printer offline, feature flag off). Each reason
 * gets its own operator-facing copy so the cashier knows whether to walk
 * to the kitchen, the bar, or to power-cycle the printer.
 */
function printSkipReasonToWarning(
  reason: string | undefined,
): string | undefined {
  if (reason === "no_printer") {
    return "Đã hủy món. Máy in bếp offline — báo bếp trực tiếp.";
  }
  if (reason === "no_slot") {
    return "Đã hủy món. Món không thuộc khu vực bếp (đồ uống chai?) — báo bar trực tiếp.";
  }
  if (reason === "feature_disabled") {
    return "Đã hủy món. Tính năng in phiếu hủy đang tắt — báo bếp trực tiếp.";
  }
  return undefined;
}

/**
 * `afterSuccess` hook for `voidOrderItem`. When the handler reports the
 * RPC actually saw the item ("was_sent_to_kitchen"), this hook fires the
 * cancel-ticket print RPC and reduces its outcome to an optional warning.
 *
 * Contract (matches `AfterSuccessHook<VoidItemInput, ...>`):
 * - Reads `result.meta?.wasSentToKitchen` (the handler sets this).
 * - Returns `{ warning }` only when there's something to surface. Returning
 *   `undefined` leaves `meta.warning` unset.
 * - NEVER throws to the wrapper. Any unexpected failure here gets mapped
 *   to a warning so the void itself stays committed (which it already is).
 *
 * The hook does NOT use `mapRpcError` because the output is a warning
 * string, not an `ActionResult`. The void operation has already succeeded
 * from the caller's perspective.
 */
export const enqueueCancelTicketPrintHook: AfterSuccessHook<
  VoidItemInput,
  { autoCancelledOrder: boolean }
> = async (input, result, ctx) => {
  const wasSentToKitchen = result.meta?.wasSentToKitchen === true;
  if (!wasSentToKitchen) return;

  const supabase: SupabaseClient = ctx.supabase;

  const { data: printData, error: printError } = await supabase.rpc(
    "enqueue_cancel_ticket_print",
    {
      p_order_item_id: input.orderItemId,
      p_reason: input.reason,
    },
  );

  if (printError) {
    return { warning: printErrorToWarning(printError.message) };
  }

  const payload = printData as
    | { skipped?: boolean; reason?: string }
    | null
    | undefined;
  if (payload?.skipped) {
    const warning = printSkipReasonToWarning(payload.reason);
    if (warning) return { warning };
  }
  return;
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Re-exports for convenience inside actions/_components consumers           */
/* ────────────────────────────────────────────────────────────────────────── */

export { mapRpcError };
