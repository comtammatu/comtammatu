"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { Field, FieldGroup, FieldLabel } from "@comtammatu/ui/components/field";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { QuickReasonChips } from "../quick-reason-chips";
import { CANCEL_ORDER_PRESETS } from "../quick-reason-presets";

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
  const trimmedLen = reason.trim().length;
  // Mirror server-side cancelOrderSchema (order-actions.ts): min(5).
  const reasonReady = trimmedLen >= 5;
  const orderLabel = orderNumber ? ` ${orderNumber}` : "";
  const contextLabel =
    orderType === "dine_in" ? `Bàn ${tableNumber ?? "?"}` : POS_VI.takeawayContext;
  const summary =
    itemCount > 0 ? `${itemCount} món · ${contextLabel}` : contextLabel;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hủy đơn{orderLabel}?</AlertDialogTitle>
          <AlertDialogDescription>{summary}</AlertDialogDescription>
        </AlertDialogHeader>

        <FieldGroup className="py-2">
          <Field data-invalid={!reasonReady && trimmedLen > 0}>
            <FieldLabel htmlFor="cancel-reason" className="sr-only">
              {FORM_VI.reason}
            </FieldLabel>
            <QuickReasonChips
              presets={CANCEL_ORDER_PRESETS}
              value={reason}
              onChange={onReasonChange}
              ariaLabel={POS_VI.cancelOrderReasonSuggestAria}
            />
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={POS_VI.reasonMin5Placeholder}
              aria-invalid={!reasonReady && trimmedLen > 0}
            />
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onReasonChange("")}>
            {POS_VI.keepOrder}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!reasonReady || isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!reasonReady || isPending) return;
              onConfirm();
            }}
          >
            {POS_VI.cancelOrder}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
