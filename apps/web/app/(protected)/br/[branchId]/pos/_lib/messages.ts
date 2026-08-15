/**
 * POS RPC error → user message mappings, plus the `afterSuccess` side-effect
 * hooks composed into POS server actions.
 *
 * One module per route family: the **mechanism** lives in
 * `apps/web/app/_lib/rpc-error-map.ts`, the **vocabulary** lives here.
 * Authors compose `readonly RpcErrorMapping[]` literals and pass them into
 * `mapRpcError`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@comtammatu/shared/types";
import { z } from "zod";
import {
  includesAny,
  mapRpcError,
  type RpcErrorFallback,
  type RpcErrorLike,
  type RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import type { AfterSuccessHook } from "@/_lib/with-action";
import { POS_ERROR_CODES } from "../_utils/error-codes";
import type { ReduceItemInput, VoidItemInput } from "./schemas";

/* ────────────────────────────────────────────────────────────────────────── */
/*  sendToKitchen — partial-send warning vocabulary                           */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Shown when `route_order_to_kds` returns without raising but left one or more
 * order items unrouted (no KDS station, no fallback station, no kitchen-ticket
 * printer for their category). The send is reported as a warning — not a green
 * success — so the counter knows the kitchen did not receive every item and can
 * alert the manager to fix the station/printer routing.
 */
export const KITCHEN_PARTIAL_SEND_WARNING =
  "Một số món chưa vào bếp — chưa cấu hình trạm bếp hoặc máy in cho nhóm món này. Báo quản lý kiểm tra.";

type DailyLimitConflictReason =
  | "daily_limit_item_disabled"
  | "daily_limit_exceeded";

const dailyLimitConflictDetailSchema = z.object({
  reason: z
    .enum(["daily_limit_item_disabled", "daily_limit_exceeded"])
    .optional(),
  menu_item_id: z.number().int().positive().optional(),
  item_id: z.number().int().positive().optional(),
  limit_quantity: z.number().int().nonnegative().nullable().optional(),
  sold_today: z.number().int().nonnegative().nullable().optional(),
  held_quantity: z.number().int().nonnegative().nullable().optional(),
  requested_quantity: z.number().int().positive().nullable().optional(),
});

type DailyLimitConflictDetail = z.infer<
  typeof dailyLimitConflictDetailSchema
>;

type DailyLimitRpcErrorLike = RpcErrorLike & {
  details?: unknown;
};

export interface DailyLimitItemLabel {
  menuItemId: number;
  label: string;
}

function inferDailyLimitConflictReason(
  message: string | null | undefined,
): DailyLimitConflictReason | null {
  const lower = (message ?? "").toLowerCase();
  if (lower.includes("daily_limit_item_disabled")) {
    return "daily_limit_item_disabled";
  }
  if (lower.includes("daily_limit_exceeded")) return "daily_limit_exceeded";
  return null;
}

function parseJsonDetail(details: unknown): unknown {
  if (typeof details !== "string") return details;
  const trimmed = details.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function parseLegacyDailyLimitMessage(
  message: string | null | undefined,
): DailyLimitConflictDetail | null {
  const raw = message ?? "";
  const disabled = raw.match(/daily_limit_item_disabled:\s*(\d+)/i);
  if (disabled?.[1]) {
    return {
      reason: "daily_limit_item_disabled",
      menu_item_id: Number(disabled[1]),
    };
  }

  const exceeded = raw.match(
    /daily_limit_exceeded:\s*item\s+(\d+),\s*limit\s+(\d+),\s*sold\s+(\d+),\s*held\s+(\d+),\s*requested\s+(\d+)/i,
  );
  if (!exceeded) return null;

  const [, menuItemId, limitQuantity, soldToday, heldQuantity, requested] =
    exceeded;
  if (
    menuItemId === undefined ||
    limitQuantity === undefined ||
    soldToday === undefined ||
    heldQuantity === undefined ||
    requested === undefined
  ) {
    return null;
  }

  return {
    reason: "daily_limit_exceeded",
    menu_item_id: Number(menuItemId),
    limit_quantity: Number(limitQuantity),
    sold_today: Number(soldToday),
    held_quantity: Number(heldQuantity),
    requested_quantity: Number(requested),
  };
}

function parseDailyLimitConflictDetail(
  error: DailyLimitRpcErrorLike,
): DailyLimitConflictDetail | null {
  const parsed = dailyLimitConflictDetailSchema.safeParse(
    parseJsonDetail(error.details),
  );
  if (parsed.success) {
    const inferredReason =
      parsed.data.reason ?? inferDailyLimitConflictReason(error.message);
    return {
      ...parsed.data,
      ...(inferredReason !== null ? { reason: inferredReason } : {}),
    };
  }

  return parseLegacyDailyLimitMessage(error.message);
}

function getDailyLimitItemLabel(
  itemLabels: readonly DailyLimitItemLabel[],
  menuItemId: number,
): string {
  return (
    itemLabels.find((item) => item.menuItemId === menuItemId)?.label ??
    `Món #${String(menuItemId)}`
  );
}

function formatDailyLimitConflictMessage(
  detail: DailyLimitConflictDetail,
  itemLabels: readonly DailyLimitItemLabel[],
): string | null {
  const reason = detail.reason;
  const menuItemId = detail.menu_item_id ?? detail.item_id;
  if (!reason || menuItemId === undefined) return null;

  const itemLabel = getDailyLimitItemLabel(itemLabels, menuItemId);
  if (reason === "daily_limit_item_disabled") {
    return `${itemLabel} đang tắt hôm nay — bỏ khỏi giỏ hoặc đổi món.`;
  }

  const limit = detail.limit_quantity;
  const sold = detail.sold_today ?? null;
  const held = detail.held_quantity ?? null;
  const requested = detail.requested_quantity ?? null;

  if (
    typeof limit === "number" &&
    typeof sold === "number" &&
    typeof held === "number" &&
    typeof requested === "number"
  ) {
    const remaining = Math.max(limit - sold - held, 0);
    if (remaining > 0 && requested > remaining) {
      return `${itemLabel} chỉ còn ${String(remaining)} suất, giỏ đang cần ${String(requested)} — giảm số lượng hoặc đổi món.`;
    }
    if (held > 0 && sold < limit) {
      return `${itemLabel} đang được máy khác giữ suất cuối — thử lại sau ít phút hoặc đổi món.`;
    }
  }

  return `${itemLabel} đã hết suất hôm nay — giảm số lượng hoặc đổi món.`;
}

export function mapDailyLimitRpcError<TData = unknown>(
  error: DailyLimitRpcErrorLike,
  itemLabels: readonly DailyLimitItemLabel[],
  mappings: readonly RpcErrorMapping[],
  fallback: RpcErrorFallback,
): ActionResult<TData> {
  const detail = parseDailyLimitConflictDetail(error);
  const message =
    detail !== null
      ? formatDailyLimitConflictMessage(detail, itemLabels)
      : null;

  if (message !== null) {
    return {
      success: false,
      error: message,
      errorCode:
        detail?.reason === "daily_limit_item_disabled"
          ? POS_ERROR_CODES.DAILY_LIMIT_ITEM_DISABLED
          : POS_ERROR_CODES.DAILY_LIMIT_EXCEEDED,
    };
  }

  return mapRpcError(error, mappings, fallback);
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  voidOrderItem — main RPC error vocabulary                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("void_order_item", ...)` failures. Order:
 * most-specific first. Predicates see the already-lowercased message
 * (mapRpcError lowercases once upstream).
 *
 * The RPC sentinels map as:
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
    match: includesAny("payment_code_locked"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Đơn đã phát hành QR/chuyển khoản, không thể đổi số tiền. Vui lòng hoàn tất thanh toán hoặc xử lý lại đơn.",
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
 * Kept as a free function (not via `mapRpcError`) because the desired
 * output is a plain warning string, not an `ActionResult`.
 */
function printErrorToWarning(message: string | null | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("permission denied")) {
    return "Đã hủy món. Không có quyền in phiếu hủy — báo bếp thủ công.";
  }
  if (msg.includes("tenant mismatch")) {
    return "Đã hủy món nhưng không thể in phiếu do phạm vi tài khoản không hợp lệ.";
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
    return "Đã hủy món. Máy in bếp mất kết nối — báo bếp trực tiếp.";
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
/*  reduceOrderItemQuantity — main RPC error vocabulary                       */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("reduce_order_item_quantity", ...)` failures.
 * Order: most-specific first. The RPC raises distinct sentinels for the
 * various pre-conditions (no reduction needed / not reducible / served /
 * terminal / already paid / reason too short) which the dialog UX needs to
 * differentiate.
 */
export const reduceRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("forbidden"),
    errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    userMessage: "Cần quyền hủy đơn POS để giảm SL món.",
  },
  {
    match: includesAny("payment_code_locked"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Đơn đã phát hành QR/chuyển khoản, không thể đổi số tiền. Vui lòng hoàn tất thanh toán hoặc xử lý lại đơn.",
  },
  {
    match: includesAny("no reduction needed"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Số lượng mới phải nhỏ hơn số lượng hiện tại.",
  },
  {
    match: includesAny("not reducible", "served"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Không thể giảm SL món đã phục vụ hoặc đã hủy.",
  },
  {
    match: includesAny("order terminal"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Đơn đã đóng, không thể giảm SL món.",
  },
  {
    match: includesAny("order already paid"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Đơn đã thanh toán, không thể giảm SL.",
  },
  {
    match: includesAny("reason too short"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Lý do giảm SL tối thiểu 5 ký tự.",
  },
];

export const reduceRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể giảm SL món. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  enqueue_partial_cancel_ticket_print — for reduceOrderItemQuantity         */
/* ────────────────────────────────────────────────────────────────────────── */

function reducePrintErrorToWarning(message: string | null | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("permission denied")) {
    return "Đã giảm SL. Không có quyền in phiếu báo bếp — báo bếp thủ công.";
  }
  if (msg.includes("tenant mismatch")) {
    return "Đã giảm số lượng nhưng không thể in phiếu báo bếp do phạm vi tài khoản không hợp lệ.";
  }
  return "Đã giảm SL. Không in được phiếu báo bếp — kiểm tra máy in bếp.";
}

function reducePrintSkipReasonToWarning(
  reason: string | undefined,
): string | undefined {
  if (reason === "no_printer") {
    return "Đã giảm SL. Máy in bếp mất kết nối — báo bếp trực tiếp.";
  }
  if (reason === "no_slot") {
    return "Đã giảm SL. Món không thuộc khu vực bếp (đồ uống chai?) — báo bar trực tiếp.";
  }
  if (reason === "feature_disabled") {
    return "Đã giảm SL. Tính năng in phiếu báo giảm đang tắt — báo bếp trực tiếp.";
  }
  return undefined;
}

/**
 * `afterSuccess` hook for `reduceOrderItemQuantity`. Mirror of
 * `enqueueCancelTicketPrintHook` but targets `enqueue_partial_cancel_ticket_print`
 * with the additional `p_old_quantity` / `p_new_quantity` args that the
 * partial-cancel ticket needs. Reads `result.meta` for the kitchen-sent
 * flag plus the old/new quantities (handler sets them).
 */
export const enqueuePartialCancelTicketPrintHook: AfterSuccessHook<
  ReduceItemInput,
  { qtyReduced: number; oldQuantity: number; newQuantity: number }
> = async (input, result, ctx) => {
  // `wasSentToKitchen` rides on meta (internal flag — not exposed to
  // callers). `oldQuantity` / `newQuantity` come from the handler's data
  // because the caller also wants them in the toast ("đã giảm SL: 3 → 2"),
  // so duplicating on meta would be noise.
  const wasSentToKitchen = result.meta?.wasSentToKitchen === true;
  if (!wasSentToKitchen) return;

  const oldQuantity = result.data?.oldQuantity;
  const newQuantity = result.data?.newQuantity ?? input.newQuantity;
  if (typeof oldQuantity !== "number") return;

  const supabase: SupabaseClient = ctx.supabase;
  const { data: printData, error: printError } = await supabase.rpc(
    "enqueue_partial_cancel_ticket_print",
    {
      p_order_item_id: input.orderItemId,
      p_old_quantity: oldQuantity,
      p_new_quantity: newQuantity,
      p_reason: input.reason,
    },
  );

  if (printError) {
    return { warning: reducePrintErrorToWarning(printError.message) };
  }

  const payload = printData as
    | { skipped?: boolean; reason?: string }
    | null
    | undefined;
  if (payload?.skipped) {
    const warning = reducePrintSkipReasonToWarning(payload.reason);
    if (warning) return { warning };
  }
  return;
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  cancelOrder — main RPC + skip-reason warning helper                       */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("cancel_order", ...)` failures.
 * Cancel-order is simpler than void/reduce: it raises only `forbidden` and
 * `terminal`. The downstream per-item cancel-ticket enqueues happen INSIDE
 * the RPC transaction, so there is no separate print RPC for the action
 * to follow up with — skip-reason warnings are reduced from
 * `result.skip_reasons` (see `cancelSkipReasonsToWarning` below).
 */
export const cancelRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("forbidden"),
    errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    userMessage: "Cần quyền hủy đơn POS để hủy đơn.",
  },
  {
    match: includesAny("payment_code_locked"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Đơn đã phát hành QR/chuyển khoản, không thể hủy hoặc đổi số tiền. Vui lòng hoàn tất thanh toán hoặc xử lý lại đơn.",
  },
  {
    match: includesAny("terminal"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Đơn đã kết thúc, không thể hủy.",
  },
];

export const cancelRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể hủy đơn. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/**
 * Reduce the `cancel_order` RPC's `skip_reasons[]` array down to a single
 * operator-facing toast warning. Skip-reasons are per-item; we surface the
 * MOST-IMPORTANT class (printer offline > no-slot > feature-off > other).
 */
export function cancelSkipReasonsToWarning(
  skipped: number,
  reasons: readonly string[],
): string | undefined {
  if (skipped <= 0) return undefined;
  const has = (k: string) => reasons.some((r) => r.startsWith(k));
  if (has("no_printer")) {
    return `Đã hủy đơn. ${skipped} món bếp/bar không nhận được phiếu báo hủy (máy in mất kết nối) — báo trực tiếp.`;
  }
  if (has("no_slot")) {
    return `Đã hủy đơn. ${skipped} món không có khu vực bếp (đồ uống chai?) — báo bar trực tiếp.`;
  }
  if (has("feature_disabled")) {
    return "Đã hủy đơn. Tính năng in phiếu hủy đang tắt — báo bếp trực tiếp.";
  }
  return `Đã hủy đơn. ${skipped} phiếu hủy không in được — báo bếp/bar trực tiếp.`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  editPendingOrderItem — main RPC + edit-print helpers                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("edit_pending_order_item", ...)` failures. The
 * RPC raises a wider catalogue of sentinels than void/reduce because the
 * edit path has many pre-conditions (variant active, menu item active,
 * stale options, feature flag, order state). Ordered most-specific first.
 */
export const editRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("forbidden"),
    errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    userMessage: "Cần quyền hủy đơn POS để sửa món.",
  },
  {
    match: includesAny("payment_code_locked"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Đơn đã phát hành QR/chuyển khoản, không thể đổi số tiền. Vui lòng hoàn tất thanh toán hoặc xử lý lại đơn.",
  },
  {
    match: includesAny("not editable", "preparing", "ready"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Chỉ sửa được món khi chưa được làm. Hãy hủy món + thêm món mới.",
  },
  {
    match: includesAny("order terminal"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Đơn đã đóng, không thể sửa món.",
  },
  {
    match: includesAny("order already paid"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Đơn đã thanh toán, không thể sửa món.",
  },
  {
    match: includesAny("menu item inactive"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Món đã ngừng bán — hãy hủy món và chọn món khác.",
  },
  {
    match: includesAny("variant inactive"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Biến thể không còn khả dụng — chọn biến thể khác.",
  },
  {
    match: includesAny("stale_side_or_modifier", "stale modifier", "stale side"),
    errorCode: POS_ERROR_CODES.CART_STALE_MENU_OPTION,
    userMessage:
      "Tùy chọn món đã thay đổi. Vui lòng mở món và chọn lại trước khi cập nhật.",
  },
  {
    match: includesAny("feature disabled"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Tính năng sửa món đang tắt — liên hệ quản lý.",
  },
];

export const editRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể sửa món. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/**
 * Map the edit-pending print RPC's `error.message` into the operator-facing
 * warning string. Kept as a free function (not afterSuccess) because the
 * caller `editPendingOrderItem` needs to set the `quantityPrintQueued`
 * data-level flag alongside the warning — afterSuccess only returns
 * `{ warning? }`. Handler invokes this inline.
 */
export function editPrintErrorToWarning(
  message: string | null | undefined,
): string {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("permission denied")) {
    return "Đã cập nhật món. Không có quyền in phiếu báo bếp — báo bếp thủ công.";
  }
  if (msg.includes("tenant mismatch")) {
    return "Đã cập nhật món nhưng không thể in phiếu báo bếp do phạm vi tài khoản không hợp lệ.";
  }
  return "Đã cập nhật món. Không in được phiếu báo bếp — kiểm tra máy in.";
}

export function editPrintSkipReasonToWarning(
  reason: string | undefined,
): string | undefined {
  if (reason === "no_printer") {
    return "Đã cập nhật món. Máy in bếp mất kết nối hoặc chưa nhận loại phiếu này — báo bếp trực tiếp.";
  }
  if (reason === "no_slot") {
    return "Đã cập nhật món. Món không thuộc khu vực bếp/bar — báo trực tiếp.";
  }
  if (reason === "feature_disabled") {
    return "Đã cập nhật món. Tính năng in phiếu báo giảm đang tắt — báo bếp trực tiếp.";
  }
  return undefined;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  setOrderPriority / setOrderItemPriority — RPC error vocabulary            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Map `set_pos_order_priority` / `set_pos_order_item_priority` RPC error
 * messages to operator copy. Returns a plain string — callers wrap it in
 * `ActionResult` (action handlers) or embed in a warning prefix (the
 * `markInitialOrderPriority` internal helper inside `order-actions.ts`).
 *
 * Both targets share the sentinel catalogue ("forbidden" / "terminal" /
 * "not prioritizable" / "not found") but differ in copy ("đơn" vs "món"),
 * so the function takes a `target` discriminator instead of two separate
 * RpcErrorMapping arrays (which would duplicate the substring tests).
 */
export function mapPriorityError(
  message: string,
  target: "order" | "item",
): string {
  const msg = message.toLowerCase();
  if (msg.includes("forbidden")) {
    return target === "order"
      ? "Không có quyền ưu tiên đơn."
      : "Không có quyền ưu tiên món.";
  }
  if (
    msg.includes("terminal") ||
    msg.includes("paid") ||
    msg.includes("cancelled") ||
    msg.includes("completed")
  ) {
    return "Đơn đã đóng hoặc thanh toán, không thể ưu tiên.";
  }
  if (
    msg.includes("no active kitchen work") ||
    msg.includes("not prioritizable")
  ) {
    return target === "order"
      ? "Không còn món đang chờ bếp để ưu tiên."
      : "Chỉ ưu tiên món đang chờ hoặc đang làm.";
  }
  if (msg.includes("not found")) {
    return target === "order" ? "Không tìm thấy đơn." : "Không tìm thấy món.";
  }
  return target === "order"
    ? "Không thể cập nhật ưu tiên đơn."
    : "Không thể cập nhật ưu tiên món.";
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  updatePosOrderNote — RPC error vocabulary                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export function mapOrderNoteError(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes("forbidden") || msg.includes("permission")) {
    return "Không có quyền sửa ghi chú đơn.";
  }
  if (
    msg.includes("terminal") ||
    msg.includes("completed") ||
    msg.includes("cancelled")
  ) {
    return "Đơn đã đóng hoặc hủy, không thể sửa ghi chú.";
  }
  if (msg.includes("not found")) {
    return "Không tìm thấy đơn.";
  }
  if (msg.includes("branch mismatch") || msg.includes("tenant mismatch")) {
    return "Đơn không thuộc chi nhánh hiện tại.";
  }
  return "Không thể cập nhật ghi chú đơn.";
}


/* ────────────────────────────────────────────────────────────────────────── */
/*  transferOrderTable — RPC error vocabulary                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export const transferRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("takeaway"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Chỉ chuyển bàn cho đơn tại bàn.",
  },
  {
    match: includesAny("not available"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Bàn đã có khách hoặc không khả dụng.",
  },
];

export const transferRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể chuyển bàn. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  markOrderItemServed — RPC error vocabulary                                */
/* ────────────────────────────────────────────────────────────────────────── */

export const markServedRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("invalid item transition"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Món đã phục vụ hoặc đã hủy.",
  },
  {
    match: includesAny("order terminal"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Đơn đã đóng, không thể cập nhật món.",
  },
  {
    match: includesAny("item not found"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Không tìm thấy món.",
  },
];

export const markServedRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể đánh dấu phục vụ. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  submitOrder — main RPC error vocabulary (create_order)                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("create_order", ...)` failures. The RPC raises
 * a wide catalogue because it cascades into menu validation, daily-limit
 * gating, side/modifier freshness, and Postgres-level concurrency control.
 *
 * Two of these mappings branch on `error.code` (Postgres SQLSTATE) instead
 * of `.message`:
 * - `42501` insufficient_privilege — stale RPC overload missing GRANT.
 *   Caller must re-login or escalate to ops.
 * - `55P03` lock_not_available — another `create_order` invocation holds
 *   the advisory lock. Caller can retry shortly.
 *
 * Order: code-based checks first (they raise earlier in the lifecycle),
 * then message-based sentinels grouped by behaviour family.
 */
export const submitOrderRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: (msg, code) =>
      code === "42501" || msg.includes("42501") || msg.includes("permission denied"),
    errorCode: POS_ERROR_CODES.DB_PERMISSION_DENIED,
    userMessage:
      "Không có quyền tạo đơn (hệ thống). Vui lòng đăng nhập lại hoặc liên hệ quản lý.",
  },
  {
    match: (_msg, code) => code === "55P03",
    errorCode: POS_ERROR_CODES.DB_LOCK_NOT_AVAILABLE,
    userMessage: "Đang có đơn khác được tạo. Vui lòng thử lại sau vài giây.",
  },
  {
    match: includesAny(
      "order_items_discount_metadata_paired",
      "discount_note_required",
      "discount_invalid",
    ),
    errorCode: POS_ERROR_CODES.INPUT_INVALID_DISCOUNT,
    userMessage: "Chiết khấu món không hợp lệ — cần ghi chú lý do (≥3 ký tự).",
  },
  {
    // Stale `pos_session_id` from RSC props: cashier closed (and re-opened)
    // the shift on another tab/terminal while this tab still holds the old
    // session.id. RPC raises P0002 with this exact wording. Surface a typed
    // code so the client can router.refresh() instead of looping forever.
    match: includesAny("pos session does not belong", "is not open"),
    errorCode: POS_ERROR_CODES.SCOPE_SESSION_NOT_OPEN,
    userMessage: "Ca POS đã đóng hoặc đổi máy — đang tải lại trang.",
  },
  {
    match: includesAny("daily_limit_item_disabled"),
    errorCode: POS_ERROR_CODES.DAILY_LIMIT_ITEM_DISABLED,
    userMessage: "Có món đã bị tắt trong ngày — bỏ khỏi giỏ trước khi đặt.",
  },
  {
    match: includesAny("daily_limit_exceeded"),
    errorCode: POS_ERROR_CODES.DAILY_LIMIT_EXCEEDED,
    userMessage: "Có món đã hết suất hôm nay — giảm số lượng hoặc đổi món.",
  },
  {
    // P0001 from the ingredient-stock trigger:
    // `insufficient_stock_ingredient:<ingredient_id>`. Hard stop — branch
    // ran out of a kitchen ingredient a recipe needs. NON-retryable.
    match: includesAny("insufficient_stock_ingredient"),
    errorCode: POS_ERROR_CODES.INGREDIENT_STOCK_INSUFFICIENT,
    userMessage: "Không đủ nguyên liệu trong kho để bán món này.",
  },
  {
    match: includesAny(
      "stale_side_or_modifier",
      "stale modifier",
      "stale side",
    ),
    errorCode: POS_ERROR_CODES.CART_STALE_MENU_OPTION,
    userMessage:
      "Tùy chọn món đã thay đổi. Vui lòng mở món và chọn lại trước khi đặt.",
  },
  {
    match: includesAny("empty"),
    errorCode: POS_ERROR_CODES.CART_EMPTY,
    userMessage: "Giỏ hàng trống",
  },
];

export const submitOrderRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể tạo đơn hàng. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  appendOrderItems — main RPC error vocabulary                              */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("append_order_items", ...)` failures. Shares
 * vocabulary with `create_order` for daily-limit and stale-options paths;
 * adds `order_not_appendable` for orders past the pending state.
 */
export const appendOrderItemsRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("payment_code_locked"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Đơn đã phát hành QR/chuyển khoản, không thể thêm món làm đổi số tiền. Vui lòng hoàn tất thanh toán hoặc xử lý lại đơn.",
  },
  {
    match: includesAny(
      "order_items_discount_metadata_paired",
      "discount_note_required",
      "discount_invalid",
    ),
    errorCode: POS_ERROR_CODES.INPUT_INVALID_DISCOUNT,
    userMessage: "Chiết khấu món không hợp lệ — cần ghi chú lý do (≥3 ký tự).",
  },
  {
    match: includesAny("order_not_appendable", "appendable"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Không thể thêm món vào đơn ở trạng thái này.",
  },
  {
    match: includesAny("not found", "inactive"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Món không còn trong thực đơn hoặc đã ngừng bán.",
  },
  {
    match: includesAny("daily_limit_item_disabled"),
    errorCode: POS_ERROR_CODES.DAILY_LIMIT_ITEM_DISABLED,
    userMessage: "Có món đã bị tắt trong ngày — bỏ khỏi giỏ trước khi đặt.",
  },
  {
    match: includesAny("daily_limit_exceeded"),
    errorCode: POS_ERROR_CODES.DAILY_LIMIT_EXCEEDED,
    userMessage: "Có món đã hết suất hôm nay — giảm số lượng hoặc đổi món.",
  },
  {
    // P0001 from the ingredient-stock trigger:
    // `insufficient_stock_ingredient:<ingredient_id>`. NON-retryable.
    match: includesAny("insufficient_stock_ingredient"),
    errorCode: POS_ERROR_CODES.INGREDIENT_STOCK_INSUFFICIENT,
    userMessage: "Không đủ nguyên liệu trong kho để bán món này.",
  },
  {
    match: includesAny(
      "stale_side_or_modifier",
      "stale modifier",
      "stale side",
    ),
    errorCode: POS_ERROR_CODES.CART_STALE_MENU_OPTION,
    userMessage:
      "Tùy chọn món đã thay đổi. Vui lòng mở món và chọn lại trước khi thêm.",
  },
];

export const appendOrderItemsRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể thêm món. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  dailyLimitHolds — reserve/release draft quota                             */
/* ────────────────────────────────────────────────────────────────────────── */

export const dailyLimitHoldRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("permission denied", "branch scope mismatch"),
    errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    userMessage: "Không có quyền giữ suất bán ở chi nhánh này.",
  },
  {
    match: includesAny("daily_limit_item_disabled"),
    errorCode: POS_ERROR_CODES.DAILY_LIMIT_ITEM_DISABLED,
    userMessage: "Có món đã bị tắt trong ngày — bỏ khỏi giỏ trước khi đặt.",
  },
  {
    match: includesAny("daily_limit_exceeded"),
    errorCode: POS_ERROR_CODES.DAILY_LIMIT_EXCEEDED,
    userMessage: "Có món vừa hết suất hôm nay — giảm số lượng hoặc đổi món.",
  },
];

export const dailyLimitHoldRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể giữ suất món. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Re-exports for convenience inside actions/_components consumers           */
/* ────────────────────────────────────────────────────────────────────────── */

export { mapRpcError };
