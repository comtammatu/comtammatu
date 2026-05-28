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
