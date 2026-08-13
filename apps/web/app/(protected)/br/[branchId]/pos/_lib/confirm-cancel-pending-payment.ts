"use client";

import { toast } from "@comtammatu/ui/components/sonner";
import { confirm, type ConfirmOptions } from "@/components/confirm-dialog";
import { messages } from "@lib/messages";
import {
  cancelPendingPayment,
  fetchPendingRemotePaymentForBill,
} from "../payment-actions";

export function pendingPaymentUnlockConfirmOptions(): ConfirmOptions {
  return {
    title: messages.pos.payment.cancelPendingConfirmTitle,
    description: messages.pos.payment.cancelPendingConfirmDescription,
    confirmText: messages.pos.payment.cancelPendingConfirmAction,
    cancelText: messages.pos.payment.cancelPendingKeep,
    variant: "destructive",
  };
}

/**
 * When a pending VietQR / payment code locks amount mutations, ask via the
 * shared confirm Dialog. Confirm cancels that pending row then returns true
 * so the caller can continue the original UI action. Dismiss keeps the lock.
 */
export async function confirmAndCancelPendingPayment(input: {
  branchId: number;
  orderId: number;
  locked: boolean;
}): Promise<boolean> {
  if (!input.locked) return true;

  const confirmed = await confirm(pendingPaymentUnlockConfirmOptions());
  if (!confirmed) return false;

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
    toast.success(messages.pos.payment.pendingCancelled);
  }

  return true;
}
