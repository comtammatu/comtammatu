/**
 * Payment RPC error → user message mappings.
 *
 * Separated from `messages.ts` (order lifecycle) so neither file balloons
 * past readability. Each vocabulary is owned by one route family; this
 * file owns the payment-actions vocabulary.
 */

import {
  includesAny,
  type RpcErrorFallback,
  type RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import { POS_ERROR_CODES } from "../_utils/error-codes";

/* ────────────────────────────────────────────────────────────────────────── */
/*  confirmCashPayment — RPC error vocabulary                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Mappings for `confirm_cash_payment_with_invoice_binding`, which delegates
 * the commercial close to `confirm_cash_payment` after self-order guards.
 * Order: under-payment / sane-bound checks first (most common operator
 * errors), then permission/tenant defence-in-depth (server-side gates
 * should never raise these in practice but UI must still show stable
 * copy), then the shared payment vocabulary, then a printer-config edge
 * case.
 */
export const confirmCashPaymentRpcMappings: readonly RpcErrorMapping[] = [
  // Cash-specific sentinels first.
  {
    match: includesAny("self_order_payment_cancel_staff_required"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Đơn đang chờ chuyển khoản từ QR tự gọi món. Hãy kiểm tra tiền về và hủy yêu cầu tại hàng chờ trước khi thu tiền mặt.",
  },
  {
    match: includesAny("invoice_snapshot_immutable"),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Dữ liệu HĐĐT của đơn đã được chốt nên hệ thống không thể tiếp tục. Không thu thêm tiền; hãy tải lại đơn để kiểm tra trạng thái thanh toán, rồi báo quản lý nếu đơn vẫn chưa hoàn tất.",
  },
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
    // different copy "Không thể xử lý..."): cashier sees "Không có quyền
    // truy cập đơn này" for confirm_cash_payment, generic copy for
    // createPayment / VietQR.
    match: includesAny("tenant mismatch"),
    errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    userMessage: "Không có quyền truy cập đơn này",
  },
  // Shared payment vocabulary, inlined so the mapping table is the single
  // source.
  {
    match: includesAny(
      "default_consumption_location_missing",
      "consumption_location_missing",
      "consume_location_missing",
      "default_consumption",
    ),
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Chi nhánh chưa cấu hình Kho chi nhánh cho POS. Thiết lập kho trước khi thanh toán.",
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
 * Mappings for `supabase.rpc("create_remote_payment_intent", ...)` failures.
 *
 * Order (most-specific → most-general):
 *
 * 1. `already_paid` — payment-intent-specific. Different copy from the
 *    pre-RPC `order.payment_status === "paid"` guard inside the handler
 *    (both say "Đơn hàng đã thanh toán." — kept identical so cashier sees
 *    the same toast regardless of which check fired first).
 * 2. `amount_mismatch_recomputed` BEFORE `amount_mismatch` — substring
 *    shadow. The longer sentinel ("đơn đã thay đổi so với dữ liệu món…")
 *    is the shared payment vocabulary; the shorter `amount_mismatch`
 *    is the payment-intent RPC's own check ("Số tiền không khớp.").
 * 3. Shared payment vocabulary — inlined so the mapping table is the
 *    single source of truth.
 *
 * `tenant_mismatch` here uses the GENERIC copy ("Không thể xử lý thanh
 * toán cho chi nhánh này.") — different from `confirmCashPaymentRpcMappings`
 * which uses the cash-specific "Không có quyền truy cập đơn này". The drift
 * between the two is INTENTIONAL.
 *
 * 23505 / `unique_violation` is NOT in the mapping table. The handler
 * detects it BEFORE calling `mapRpcError` because the retry logic must
 * query the `payments` table for an existing pending row and either
 * reuse it or surface a typed "đang chờ xử lý" message — neither outcome
 * fits the `RpcErrorMapping` shape.
 */
export const createPaymentRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: (_message, code) => code === "55P03",
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
    userMessage:
      "Đơn hàng đang được xử lý bởi một giao dịch khác. Vui lòng tải lại sau vài giây.",
  },
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
      "Chi nhánh chưa cấu hình Kho chi nhánh cho POS. Thiết lập kho trước khi thanh toán.",
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
