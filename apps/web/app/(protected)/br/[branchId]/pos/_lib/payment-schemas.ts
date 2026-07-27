/**
 * Zod input schemas for POS payment-actions. Separated from `schemas.ts`
 * (order lifecycle) so each module stays focused and < 400 LoC; both still
 * live under `pos/_lib/` since payment is part of the POS surface.
 */

import { z } from "zod";

/**
 * Schema for `confirmCashPayment(branchId, orderId, cashReceived)`. The cashier UI
 * clamps `cashReceived >= total` client-side, but the server-side RPC is
 * the authoritative gate (this schema only enforces non-negative; the
 * `must be >=` sentinel comes from the RPC for under-payment).
 */
export const cashConfirmSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Mã chi nhánh không hợp lệ" }),
  orderId: z.coerce.number().int().positive({ error: "Mã đơn hàng không hợp lệ" }),
  cashReceived: z.coerce
    .number()
    .nonnegative({ error: "Số tiền nhận không được âm" }),
});

/**
 * Schema for `createPayment(branchId, orderId, method, amount)`.
 *
 * Aggregates all 4 positional args. Only VietQR creates a pending
 * intent here; cash uses the confirmation RPC and cash-drawer gate.
 *
 * Field order matters: branchId is validated first, then the remaining
 * three, so the first-issue message stays identical when multiple fields
 * fail validation simultaneously.
 *
 * `amount.positive()`: server-side amount-vs-`order.total_amount` equality
 * check lives INSIDE the handler — schema only rejects zero/negative.
 */
export const createPaymentSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Mã chi nhánh không hợp lệ" }),
  orderId: z.coerce.number().int().positive(),
  method: z.enum(["vietqr"]),
  amount: z.coerce.number().positive({ error: "Số tiền không hợp lệ" }),
});

/**
 * Shared schema for branch-only read actions:
 *   - `fetchPaymentMethodsForPos(branchId)` — RSC seed for POS bill sheet.
 *   - `fetchVietQrConfig(branchId)` — RSC seed for Owner VietQR config.
 *
 * Both reads check `claims.branch_id === input.branchId` inline (different
 * error copy "Không có quyền truy cập chi nhánh này" — kept inside handler
 * because `customAuth` returning null collapses to the generic
 * "Không có quyền" via the helper's FORBIDDEN_ERROR default).
 */
export const branchOnlyReadSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Mã chi nhánh không hợp lệ" }),
});

/**
 * Schema for `fetchPendingRemotePaymentForBill(branchId, orderId)`. Reads
 * the latest non-failed payment row for an order so the bill sheet can
 * decide whether to resume an in-flight VietQR session or start fresh.
 *
 * `orderId` carries the explicit "Order ID không hợp lệ" error message;
 * field order is branchId first so the first-issue message stays identical
 * when both fields are invalid.
 */
export const fetchPendingRemotePaymentSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Mã chi nhánh không hợp lệ" }),
  orderId: z.coerce.number().int().positive({ error: "Mã đơn hàng không hợp lệ" }),
});

export const cancelPendingPaymentSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Mã chi nhánh không hợp lệ" }),
  paymentId: z.coerce
    .number()
    .int()
    .positive({ error: "Payment ID không hợp lệ" }),
});
