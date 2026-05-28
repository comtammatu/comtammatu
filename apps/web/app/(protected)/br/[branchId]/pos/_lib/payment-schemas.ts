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

export type CancelPendingPaymentInput = z.infer<
  typeof cancelPendingPaymentSchema
>;
