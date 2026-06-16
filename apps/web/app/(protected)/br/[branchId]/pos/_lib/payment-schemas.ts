/**
 * Zod input schemas for POS payment-actions. Separated from `schemas.ts`
 * (order lifecycle) so each module stays focused and < 400 LoC; both still
 * live under `pos/_lib/` since payment is part of the POS surface.
 *
 * Schemas accrete here as WS-1b batch 4 migrates payment-actions.ts to the
 * extended withAction helper. WS-1b batch 4 starts with
 * `cancelPendingPayment` as the proving slice; the rest follow.
 */

import { z } from "zod";

/**
 * Schema for `cancelPendingPayment(branchId, paymentId)`. Flips pending
 * MoMo / VietQR payment → failed and resets the parent order so it can
 * be split, merged, or restart a fresh payment session.
 */
export const cancelPendingPaymentSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Branch ID không hợp lệ" }),
  paymentId: z.coerce
    .number()
    .int()
    .positive({ error: "Payment ID không hợp lệ" }),
});

/**
 * Schema for `confirmCashPayment(orderId, cashReceived)`. The cashier UI
 * clamps `cashReceived >= total` client-side, but the server-side RPC is
 * the authoritative gate (this schema only enforces non-negative; the
 * `must be >=` sentinel comes from the RPC for under-payment).
 */
export const cashConfirmSchema = z.object({
  orderId: z.coerce.number().int().positive({ error: "Order ID không hợp lệ" }),
  cashReceived: z.coerce
    .number()
    .nonnegative({ error: "Số tiền nhận không được âm" }),
});

/**
 * Schema for `createPayment(branchId, orderId, method, amount)`.
 *
 * Aggregates all 4 positional args. `method` enum is `["cash", "momo"]` —
 * VietQR has its own dedicated confirmation paths (`confirmVietQrPayment`
 * / `confirmVietQrPaymentWithInvoice`) and does not flow through this
 * action.
 *
 * Field order matches the pre-WS-1b parse order (branchId first, then the
 * remaining three via `paymentSchema`) so the first-issue message stays
 * identical when multiple fields fail validation simultaneously.
 *
 * `amount.positive()`: server-side amount-vs-`order.total_amount` equality
 * check lives INSIDE the handler — schema only rejects zero/negative.
 */
export const createPaymentSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Branch ID không hợp lệ" }),
  orderId: z.coerce.number().int().positive(),
  method: z.enum(["cash", "momo"]),
  amount: z.coerce.number().positive({ error: "Số tiền không hợp lệ" }),
});

/**
 * Shared schema for branch-only read actions:
 *   - `fetchPaymentMethodsForPos(branchId)` — RSC seed for POS bill sheet.
 *   - `fetchVietQrConfig(branchId)` — RSC seed for QR client-side generation.
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
    .positive({ error: "Branch ID không hợp lệ" }),
});

/**
 * Schema for `fetchPendingRemotePaymentForBill(branchId, orderId)`. Reads
 * the latest non-failed payment row for an order so the bill sheet can
 * decide whether to resume an in-flight MoMo QR session or start fresh.
 *
 * `orderId` carries the explicit "Order ID không hợp lệ" error message
 * matching the pre-WS-1b hand-rolled `safeParse` fallback string —
 * field order branchId first so the first-issue message stays identical
 * when both fields are invalid.
 */
export const fetchPendingRemotePaymentSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Branch ID không hợp lệ" }),
  orderId: z.coerce
    .number()
    .int()
    .positive({ error: "Order ID không hợp lệ" }),
});
