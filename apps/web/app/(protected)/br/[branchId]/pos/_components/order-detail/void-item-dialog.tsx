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
import { VOID_ITEM_PRESETS } from "../quick-reason-presets";

import { FORM_VI } from "@comtammatu/shared/messages";
interface VoidItemDialogProps {
  open: boolean;
  reason: string;
  onReasonChange: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  itemLabel?: string | null;
  isPending?: boolean;
}

export function VoidItemDialog({
  open,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  itemLabel,
  isPending = false,
}: VoidItemDialogProps) {
  const trimmedLen = reason.trim().length;
  // Mirror server-side voidItemSchema (order-actions.ts): min(5). Surface
  // the rule as a counter + invalid state so cashier sees it before submit
  // rather than getting a delayed action reject.
  const reasonReady = trimmedLen >= 5;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {itemLabel ? `Hủy món: ${itemLabel}` : "Hủy món?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="sr-only">
            Hủy dòng món này, đơn vẫn tiếp tục.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FieldGroup>
          <Field data-invalid={!reasonReady && trimmedLen > 0}>
            <FieldLabel htmlFor="void-reason" className="sr-only">
              {FORM_VI.reason}
            </FieldLabel>
            <QuickReasonChips
              presets={VOID_ITEM_PRESETS}
              value={reason}
              onChange={onReasonChange}
              ariaLabel="Gợi ý lý do hủy món"
            />
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Lý do (≥ 5 ký tự)"
              aria-invalid={!reasonReady && trimmedLen > 0}
            />
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel>Giữ món</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!reasonReady || isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!reasonReady || isPending) return;
              onConfirm();
            }}
          >
            Hủy món
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
