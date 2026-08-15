"use client";

import { toast } from "@comtammatu/ui/components/sonner";
import { messages } from "@lib/messages";
import {
  cancelPendingPayment,
  fetchPendingRemotePaymentForBill,
} from "../payment-actions";

/**
 * When a pending VietQR / payment code is active, silently cancel that pending
 * row in the background so the caller can continue the original UI action
 * seamlessly without blocking the operator with modal dialogs.
 */
export async function confirmAndCancelPendingPayment(input: {
  branchId: number;
  orderId: number;
  locked: boolean;
}): Promise<boolean> {
  if (!input.locked) return true;

  const pending = await fetchPendingRemotePaymentForBill(
    input.branchId,
    input.orderId,
  );
  if (!pending.success) {
    toast.error(pending.error ?? messages.pos.payment.pendingSessionLoadFailed);
    return false;
  }

  if (pending.data) {
    const cancelled = await cancelPendingPayment(
      input.branchId,
      pending.data.payment_id,
    );
    if (!cancelled.success) {
      toast.error(cancelled.error ?? messages.pos.payment.cancelPendingFailed);
      return false;
    }
  }

  return true;
}
