import {
  includesAny,
  type RpcErrorFallback,
  type RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import { POS_ERROR_CODES } from "../_utils/error-codes";

export const REFUND_PAID_ORDER_MAPPINGS: readonly RpcErrorMapping[] = [
  // Routing-to-accountant cases: cross-period invoices and daily summaries
  // cannot be voided at POS and must go through Finance.
  {
    match: includesAny("cross_period_invoice"),
    errorCode: "pos.void_paid.cross_period_invoice",
    userMessage:
      "Hoá đơn thuộc kỳ thuế đã kê khai — không thể huỷ tại POS. Vui lòng xử lý qua Kế toán.",
  },
  {
    match: includesAny("order_in_daily_summary"),
    errorCode: "pos.void_paid.order_in_daily_summary",
    userMessage:
      "Đơn đã gộp vào hoá đơn tổng hợp ngày — xử lý qua Kế toán.",
  },
  // Multiple payments: ambiguous refund target — accountant must resolve.
  {
    match: includesAny("multiple_payments"),
    errorCode: "pos.void_paid.multiple_payments",
    userMessage:
      "Đơn có nhiều giao dịch thanh toán — không thể tự động huỷ. Vui lòng xử lý qua Kế toán.",
  },
  // Permission denial (route gate + DB RLS; code 42501 also matches).
  {
    match: (msg, code) =>
      msg.includes("forbidden") || code === "42501" || msg.includes("42501"),
    errorCode: POS_ERROR_CODES.DB_PERMISSION_DENIED,
    userMessage: "Bạn không có quyền huỷ đơn đã thanh toán.",
  },
  {
    match: includesAny("unauthenticated"),
    errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    userMessage: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.",
  },
  {
    match: includesAny("tenant_mismatch"),
    errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    userMessage: "Không có quyền truy cập đơn này.",
  },
  {
    match: includesAny("order_not_found"),
    errorCode: "pos.void_paid.order_not_found",
    userMessage: "Không tìm thấy đơn hàng.",
  },
  {
    match: includesAny("order_already_cancelled"),
    errorCode: "pos.void_paid.already_cancelled",
    userMessage: "Đơn hàng đã được huỷ trước đó.",
  },
  {
    match: includesAny("order_not_paid"),
    errorCode: "pos.void_paid.order_not_paid",
    userMessage: "Đơn hàng chưa được thanh toán.",
  },
  {
    match: includesAny("no_completed_payment"),
    errorCode: "pos.void_paid.no_completed_payment",
    userMessage: "Không tìm thấy giao dịch thanh toán hoàn thành cho đơn này.",
  },
  {
    match: includesAny("already_refunded"),
    errorCode: "pos.void_paid.already_refunded",
    userMessage: "Đơn hàng đã được hoàn tiền.",
  },
  // Reason validation (raised by RPC when p_reason is too short/long).
  {
    match: includesAny("reason_too_short"),
    errorCode: "pos.void_paid.reason_too_short",
    userMessage: "Lý do huỷ phải có ít nhất 20 ký tự.",
  },
  {
    match: includesAny("reason_too_long"),
    errorCode: "pos.void_paid.reason_too_long",
    userMessage: "Lý do huỷ quá dài.",
  },
];

export const REFUND_PAID_ORDER_FALLBACK: RpcErrorFallback = {
  userMessage: "Không thể huỷ đơn đã thanh toán.",
  errorCode: POS_ERROR_CODES.RPC_GENERIC,
};
