"use client";

import { Button } from "@comtammatu/ui/components/button";
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
import { Minus as IconMinus, Plus as IconPlus } from "lucide-react";
import { QuickReasonChips } from "../quick-reason-chips";
import { REDUCE_ITEM_PRESETS } from "../quick-reason-presets";

import { FORM_VI, POS_VI } from "@comtammatu/shared/messages";
interface ReduceQuantityDialogProps {
  open: boolean;
  /** Current quantity on the order_item row — drives stepper bounds. */
  currentQuantity: number;
  newQuantity: number;
  onNewQuantityChange: (next: number) => void;
  reason: string;
  onReasonChange: (next: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  itemLabel?: string | null;
  isPending?: boolean;
}

/**
 * "Giảm số lượng" dialog — partial-cancel for a sent order item.
 *
 * Stepper bounded `[1, currentQuantity - 1]`: floor 1 forces the cashier to
 * use "Hủy món" if they want the line gone (lets KDS card flip cancelled);
 * ceiling currentQuantity-1 enforces the "reduction" semantic (server also
 * rejects newQty >= old). Reason mirrors voidItemSchema min(5) so the audit
 * trail can't be defeated by single-char "x" entries.
 */
export function ReduceQuantityDialog({
  open,
  currentQuantity,
  newQuantity,
  onNewQuantityChange,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  itemLabel,
  isPending = false,
}: ReduceQuantityDialogProps) {
  const trimmedLen = reason.trim().length;
  const reasonReady = trimmedLen >= 5;
  const minQty = 1;
  const maxQty = Math.max(currentQuantity - 1, minQty);
  const qtyValid =
    Number.isFinite(newQuantity) &&
    newQuantity >= minQty &&
    newQuantity <= maxQty;
  const canSubmit = reasonReady && qtyValid && !isPending;
  const qtyReduced = qtyValid ? currentQuantity - newQuantity : 0;

  const decrement = () => {
    if (newQuantity > minQty) onNewQuantityChange(newQuantity - 1);
  };
  const increment = () => {
    if (newQuantity < maxQty) onNewQuantityChange(newQuantity + 1);
  };

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
            {itemLabel ? `Giảm SL: ${itemLabel}` : POS_VI.reduceQtyTitleFallback}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Hiện tại {currentQuantity}. Mới: {minQty}–{maxQty}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reduce-qty" className="sr-only">
              {POS_VI.reduceQtyNewLabel}
            </FieldLabel>
            <div
              role="group"
              aria-label={POS_VI.reduceQtyNewAria}
              className="flex items-center justify-center gap-2"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={POS_VI.decreaseAria}
                disabled={newQuantity <= minQty || isPending}
                onClick={decrement}
              >
                <IconMinus />
              </Button>
              <output
                id="reduce-qty"
                aria-live="polite"
                className="min-w-12 text-center font-mono text-2xl font-semibold tabular-nums"
              >
                {newQuantity}
              </output>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={POS_VI.increaseAria}
                disabled={newQuantity >= maxQty || isPending}
                onClick={increment}
              >
                <IconPlus />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Giảm {qtyReduced} phần
            </p>
          </Field>

          <Field data-invalid={!reasonReady && trimmedLen > 0}>
            <FieldLabel htmlFor="reduce-reason" className="sr-only">
              {FORM_VI.reason}
            </FieldLabel>
            <QuickReasonChips
              presets={REDUCE_ITEM_PRESETS}
              value={reason}
              onChange={onReasonChange}
              ariaLabel={POS_VI.reduceReasonSuggestAria}
            />
            <Textarea
              id="reduce-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={POS_VI.reasonMin5Placeholder}
              aria-invalid={!reasonReady && trimmedLen > 0}
            />
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel>{POS_VI.keepUnchanged}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit}
            onClick={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              onConfirm();
            }}
          >
            {POS_VI.confirmReduce}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
