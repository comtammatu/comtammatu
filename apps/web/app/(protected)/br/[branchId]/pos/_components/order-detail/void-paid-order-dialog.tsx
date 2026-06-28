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
import { FORM_VI } from "@comtammatu/shared/messages";
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
  const trimmedLen = reason.trim().length;
  // Mirror server-side voidPaidOrderSchema (void-paid-actions.ts): min(20).
  const reasonReady = trimmedLen >= 20;
  const orderLabel = orderNumber ? ` ${orderNumber}` : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {messages.pos.order.voidPaidTitle.replace("?", `${orderLabel}?`)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {messages.pos.order.voidPaidDesc}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FieldGroup className="py-2">
          <Field data-invalid={!reasonReady && trimmedLen > 0}>
            <FieldLabel htmlFor="void-paid-reason" className="sr-only">
              {FORM_VI.reason}
            </FieldLabel>
            <Textarea
              id="void-paid-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={messages.pos.order.voidPaidPlaceholder}
              aria-invalid={!reasonReady && trimmedLen > 0}
            />
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onReasonChange("")}>
            {messages.pos.order.voidPaidKeep}
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
            {messages.pos.order.voidPaidConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
