"use client";

import { FORM_VI } from "@comtammatu/shared/messages";
import { PAYMENT_METHOD_LABELS_VI } from "@comtammatu/shared/labels";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { messages } from "@lib/messages";
import {
  REFUND_PAYOUT_METHODS,
  type RefundPayoutMethod,
} from "@lib/refund-payout";

interface VoidPaidOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  payoutMethod: RefundPayoutMethod | null;
  onPayoutMethodChange: (method: RefundPayoutMethod) => void;
  onConfirm: () => void;
  orderNumber?: string | null;
  isPending?: boolean;
}

export function VoidPaidOrderDialog({
  open,
  onOpenChange,
  reason,
  onReasonChange,
  payoutMethod,
  onPayoutMethodChange,
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
      canConfirm={payoutMethod != null}
      isPending={isPending}
      onCancelClick={() => onReasonChange("")}
      onConfirm={onConfirm}
    >
      <Field>
        <FieldLabel htmlFor="void-paid-payout-method">
          {messages.pos.order.refundPayoutMethod}
        </FieldLabel>
        <Select
          value={payoutMethod ?? undefined}
          onValueChange={(value) =>
            onPayoutMethodChange(value as RefundPayoutMethod)
          }
          disabled={isPending}
        >
          <SelectTrigger id="void-paid-payout-method">
            <SelectValue
              placeholder={messages.pos.order.refundPayoutMethodPlaceholder}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {REFUND_PAYOUT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {PAYMENT_METHOD_LABELS_VI[method]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </ReasonConfirmDialog>
  );
}
