"use client";

import { FORM_VI } from "@comtammatu/shared/messages";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { messages } from "@lib/messages";

interface VoidPaidOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  orderNumber?: string | null;
  isPending?: boolean;
}

export function VoidPaidOrderDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  onConfirm,
  orderNumber,
  isPending = false,
}: VoidPaidOrderDialogProps) {
  // Mirror server-side voidPaidOrderSchema (void-paid-actions.ts): min(20).
  const reasonMinLength = 20;
  const orderLabel = orderNumber ? ` ${orderNumber}` : "";

  return (
    <ReasonConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={messages.pos.order.voidPaidTitle.replace("?", `${orderLabel}?`)}
      description={messages.pos.order.voidPaidDesc}
      reasonId="void-paid-reason"
      reason={reason}
      onReasonChange={onReasonChange}
      reasonLabel={FORM_VI.reason}
      reasonPlaceholder={messages.pos.order.voidPaidPlaceholder}
      reasonMinLength={reasonMinLength}
      fieldGroupClassName="py-2"
      cancelLabel={messages.pos.order.voidPaidKeep}
      confirmLabel={messages.pos.order.voidPaidConfirm}
      confirmVariant="destructive"
      isPending={isPending}
      onCancelClick={() => onReasonChange("")}
      onConfirm={onConfirm}
    />
  );
}
