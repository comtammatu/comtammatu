"use client";

import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { Minus as IconMinus, Plus as IconPlus } from "lucide-react";
import { REDUCE_ITEM_PRESETS } from "../quick-reason-presets";
import { QuickReasonChips } from "../quick-reason-chips";

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
  const minQty = 1;
  const maxQty = Math.max(currentQuantity - 1, minQty);
  const qtyValid =
    Number.isFinite(newQuantity) &&
    newQuantity >= minQty &&
    newQuantity <= maxQty;
  const qtyReduced = qtyValid ? currentQuantity - newQuantity : 0;

  const decrement = () => {
    if (newQuantity > minQty) onNewQuantityChange(newQuantity - 1);
  };
  const increment = () => {
    if (newQuantity < maxQty) onNewQuantityChange(newQuantity + 1);
  };

  return (
    <ReasonConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
      title={itemLabel ? `Giảm SL: ${itemLabel}` : POS_VI.reduceQtyTitleFallback}
      description={POS_VI.reduceQtyDescription(currentQuantity, minQty, maxQty)}
      reasonId="reduce-reason"
      reason={reason}
      onReasonChange={onReasonChange}
      reasonLabel={FORM_VI.reason}
      reasonPlaceholder={POS_VI.reasonMin5Placeholder}
      reasonControls={
        <QuickReasonChips
          presets={REDUCE_ITEM_PRESETS}
          value={reason}
          onChange={onReasonChange}
          ariaLabel={POS_VI.reduceReasonSuggestAria}
        />
      }
      cancelLabel={POS_VI.keepUnchanged}
      confirmLabel={POS_VI.confirmReduce}
      actionSize="touch"
      canConfirm={qtyValid}
      isPending={isPending}
      onConfirm={onConfirm}
    >
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
            size="icon-touch"
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
            size="icon-touch"
            aria-label={POS_VI.increaseAria}
            disabled={newQuantity >= maxQty || isPending}
            onClick={increment}
          >
            <IconPlus />
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {POS_VI.reduceQtyDelta(qtyReduced)}
        </p>
      </Field>
    </ReasonConfirmDialog>
  );
}
