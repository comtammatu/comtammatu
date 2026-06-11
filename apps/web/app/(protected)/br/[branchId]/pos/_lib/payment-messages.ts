/**
 * Payment RPC error → user message mappings.
 *
 * Separated from `messages.ts` (order lifecycle) so neither file balloons
 * past readability. Each vocabulary is owned by one route family; this
 * file owns the payment-actions vocabulary.
 *
 * Accretes as WS-1b batch 4 migrates payment-actions.ts.
 */

import {
  includesAny,
  type RpcErrorFallback,
  type RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import { POS_ERROR_CODES } from "../_utils/error-codes";

/* ────────────────────────────────────────────────────────────────────────── */
/*  cancelPendingPayment — RPC error vocabulary                               */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("cancel_pending_payment", ...)` failures.
 * Two specific sentinels (payment_not_found / payment_not_pending) get
 * distinct copy so the cashier sees why the cancel cannot proceed.
 */
export const cancelPendingPaymentRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("payment_not_found"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Không tìm thấy phiên thanh toán.",
  },
  {
    match: includesAny("payment_not_pending"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Phiên thanh toán đã được xử lý.",
  },
];

export const cancelPendingPaymentRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể hủy phiên thanh toán.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  confirmCashPayment — RPC error vocabulary                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Map the cross-cutting payment-RPC error vocabulary used by
 * `createPayment` / `confirmCashPayment` / VietQR confirmation paths.
 * Returns a plain string — the caller chooses whether to wrap in
 * `ActionResult` or surface as a console warning. Mirrors the pre-WS-1b
 * inline `if`-chain in `payment-actions.ts`.
 *
 * Returns `null` when the message does not match any known sentinel — the
 * caller falls back to its own copy ("Không thể tạo thanh toán." etc.).
 */
export function mapPaymentRpcMessage(message: string): string | null {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("default_consumption_location_missing") ||
    normalized.includes("consumption_location_missing") ||
    normalized.includes("consume_location_missing") ||
    normalized.includes("default_consumption")
  ) {
    return "Chi nhánh chưa cấu hình Bếp chi nhánh cho POS. Thiết lập vị trí bếp trước khi thanh toán.";
  }

  if (
    normalized.includes("posting_rule_not_found") ||
    normalized.includes("gl_account_not_found") ||
    normalized.includes("fiscal_period_closed")
  ) {
    return "Thanh toán tạm thời chưa thể hoàn tất do cấu hình kế toán chưa sẵn sàng. Vui lòng liên hệ quản lý.";
  }

  if (normalized.includes("tenant_mismatch")) {
    return "Không thể xử lý thanh toán cho chi nhánh này.";
  }

  if (
    normalized.includes("stock_consumption_failed") ||
    normalized.includes("stock_failed") ||
    normalized.includes("out_of_stock") ||
    normalized.includes("recipe_missing")
  ) {
    return "Chưa thể hoàn tất thanh toán vì tồn kho hoặc định mức món chưa sẵn sàng. Quản lý đã được thông báo.";
  }

  if (normalized.includes("amount_mismatch_recomputed")) {
    return "Tổng tiền đơn đã thay đổi so với dữ liệu món. Vui lòng tải lại đơn và kiểm tra trước khi thanh toán.";
  }

  return null;
}

/**
 * Mappings for `supabase.rpc("confirm_cash_payment", ...)` failures.
 * Order: under-payment / sane-bound checks first (most common operator
 * errors), then permission/tenant defence-in-depth (server-side gates
 * should never raise these in practice but UI must still show stable
 * copy), then the shared payment vocabulary via `mapPaymentRpcMessage`,
 * then a printer-config edge case.
 *
 * `mapPaymentRpcMessage` returns a Vietnamese string OR null. Mappings
 * that depend on it short-circuit via a predicate that calls the helper
 * — when null, the next mapping gets a chance. The shared vocabulary
 * lives in `mapPaymentRpcMessage` so VietQR / createPayment can reuse it
 * once those sub-batches migrate.
 */
export const confirmCashPaymentRpcMappings: readonly RpcErrorMapping[] = [
  // Cash-specific sentinels first.
  {
    match: includesAny("must be >=", "must be >", "cash_received"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Tiền nhận phải lớn hơn hoặc bằng tổng cần thu.",
  },
  {
    match: includesAny("exceeds sane upper bound"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Số tiền nhận vượt ngưỡng hợp lệ. Vui lòng kiểm tra lại.",
  },
  {
    match: includesAny("permission denied"),
    errorCode: POS_ERROR_CODES.DB_PERMISSION_DENIED,
    userMessage: "Không có quyền thanh toán",
  },
  {
    // Cash-specific tenant_mismatch shadows the shared one (which has
    // different copy "Không thể xử lý..."). Order preserved from
    // pre-WS-1b: cashier sees "Không có quyền truy cập đơn này" for
    // confirm_cash_payment, generic copy for createPayment / VietQR.
    match: includesAny("tenant mismatch"),
    errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    userMessage: "Không có quyền truy cập đơn này",
  },
  // Shared payment vocabulary (inlined so the mapping table is the single
  // source. `mapPaymentRpcMessage` is also exported for non-cash callers
  // — createPayment / VietQR — that follow when their sub-batches land).
  {
    match: includesAny(
      "default_consumption_location_missing",
      "consumption_location_missing",
      "consume_location_missing",
      "default_consumption",
    ),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Chi nhánh chưa cấu hình Bếp chi nhánh cho POS. Thiết lập vị trí bếp trước khi thanh toán.",
  },
  {
    match: includesAny(
      "posting_rule_not_found",
      "gl_account_not_found",
      "fiscal_period_closed",
    ),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Thanh toán tạm thời chưa thể hoàn tất do cấu hình kế toán chưa sẵn sàng. Vui lòng liên hệ quản lý.",
  },
  {
    match: includesAny(
      "stock_consumption_failed",
      "stock_failed",
      "out_of_stock",
      "recipe_missing",
    ),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Chưa thể hoàn tất thanh toán vì tồn kho hoặc định mức món chưa sẵn sàng. Quản lý đã được thông báo.",
  },
  {
    match: includesAny("amount_mismatch_recomputed"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Tổng tiền đơn đã thay đổi so với dữ liệu món. Vui lòng tải lại đơn và kiểm tra trước khi thanh toán.",
  },
  // Printer config edge case last so the generic-payment sentinels match
  // first if there is overlap.
  {
    match: (msg) => msg.includes("no active") && msg.includes("printer"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Chi nhánh chưa cấu hình máy in hóa đơn. Liên hệ quản lý.",
  },
];

export const confirmCashPaymentRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể xác nhận thanh toán. Vui lòng thử lại.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  createPayment — RPC error vocabulary                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `supabase.rpc("create_payment", ...)` failures.
 *
 * Order (most-specific → most-general):
 *
 * 1. `already_paid` — `create_payment`-specific. Different copy from the
 *    pre-RPC `order.payment_status === "paid"` guard inside the handler
 *    (both say "Đơn hàng đã thanh toán." — kept identical so cashier sees
 *    the same toast regardless of which check fired first).
 * 2. `amount_mismatch_recomputed` BEFORE `amount_mismatch` — substring
 *    shadow. The longer sentinel ("đơn đã thay đổi so với dữ liệu món…")
 *    is the shared payment vocabulary; the shorter `amount_mismatch`
 *    is the `create_payment` RPC's own check ("Số tiền không khớp.").
 * 3. Shared payment vocabulary — mirrors `mapPaymentRpcMessage` so the
 *    handler can drop its call to the older local helper. Vocabulary
 *    is inlined (not via the helper) so the mapping table is the single
 *    source of truth; `mapPaymentRpcMessage` remains exported for VietQR
 *    + confirmPayment callers that still flow through the local helper
 *    until their sub-batches migrate.
 *
 * `tenant_mismatch` here uses the GENERIC copy ("Không thể xử lý thanh
 * toán cho chi nhánh này.") — different from `confirmCashPaymentRpcMappings`
 * which uses the cash-specific "Không có quyền truy cập đơn này". Drift
 * is INTENTIONAL: pre-WS-1b `createPayment` routed through the local
 * `mapPaymentRpcError` (generic copy), `confirmCashPayment` used its own
 * hand-rolled cash-specific copy. Both preserved byte-identical.
 *
 * 23505 / `unique_violation` is NOT in the mapping table. The handler
 * detects it BEFORE calling `mapRpcError` because the retry logic must
 * query the `payments` table for an existing pending row and either
 * reuse it or surface a typed "đang chờ xử lý" message — neither outcome
 * fits the `RpcErrorMapping` shape.
 */
export const createPaymentRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("already_paid"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Đơn hàng đã thanh toán.",
  },
  {
    match: includesAny("amount_mismatch_recomputed"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Tổng tiền đơn đã thay đổi so với dữ liệu món. Vui lòng tải lại đơn và kiểm tra trước khi thanh toán.",
  },
  {
    match: includesAny("amount_mismatch"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Số tiền không khớp.",
  },
  {
    match: includesAny(
      "default_consumption_location_missing",
      "consumption_location_missing",
      "consume_location_missing",
      "default_consumption",
    ),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Chi nhánh chưa cấu hình Bếp chi nhánh cho POS. Thiết lập vị trí bếp trước khi thanh toán.",
  },
  {
    match: includesAny(
      "posting_rule_not_found",
      "gl_account_not_found",
      "fiscal_period_closed",
    ),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Thanh toán tạm thời chưa thể hoàn tất do cấu hình kế toán chưa sẵn sàng. Vui lòng liên hệ quản lý.",
  },
  {
    match: includesAny("tenant_mismatch"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage: "Không thể xử lý thanh toán cho chi nhánh này.",
  },
  {
    match: includesAny(
      "stock_consumption_failed",
      "stock_failed",
      "out_of_stock",
      "recipe_missing",
    ),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Chưa thể hoàn tất thanh toán vì tồn kho hoặc định mức món chưa sẵn sàng. Quản lý đã được thông báo.",
  },
];

export const createPaymentRpcFallback: RpcErrorFallback = {
  userMessage: "Không thể tạo thanh toán.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};
