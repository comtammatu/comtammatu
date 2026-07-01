"use client";

import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { CANCEL_ORDER_PRESETS } from "../quick-reason-presets";
import { QuickReasonChips } from "../quick-reason-chips";

import { FORM_VI, POS_VI } from "@comtammatu/shared/messages";
interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  orderNumber?: string | null;
  orderType?: string | null;
  tableNumber?: number | null;
  itemCount?: number;
  isPending?: boolean;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  onConfirm,
  orderNumber,
  orderType,
  tableNumber,
  itemCount = 0,
  isPending = false,
}: CancelOrderDialogProps) {
  // Mirror server-side cancelOrderSchema (order-actions.ts): min(5).
  const reasonMinLength = 5;
  const orderLabel = orderNumber ? ` ${orderNumber}` : "";
  const contextLabel =
    orderType === "dine_in" ? `Bàn ${tableNumber ?? "?"}` : POS_VI.takeawayContext;
  const summary =
    itemCount > 0 ? `${itemCount} món · ${contextLabel}` : contextLabel;

  return (
    <ReasonConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Hủy đơn${orderLabel}?`}
      description={summary}
      reasonId="cancel-reason"
      reason={reason}
      onReasonChange={onReasonChange}
      reasonLabel={FORM_VI.reason}
      reasonPlaceholder={POS_VI.reasonMin5Placeholder}
      reasonMinLength={reasonMinLength}
      reasonControls={
        <QuickReasonChips
          presets={CANCEL_ORDER_PRESETS}
          value={reason}
          onChange={onReasonChange}
          ariaLabel={POS_VI.cancelOrderReasonSuggestAria}
        />
      }
      fieldGroupClassName="py-2"
      cancelLabel={POS_VI.keepOrder}
      confirmLabel={POS_VI.cancelOrder}
      confirmVariant="destructive"
      isPending={isPending}
      onCancelClick={() => onReasonChange("")}
      onConfirm={onConfirm}
    />
  );
}
