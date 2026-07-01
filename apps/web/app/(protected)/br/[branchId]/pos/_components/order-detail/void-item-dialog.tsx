"use client";

import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { VOID_ITEM_PRESETS } from "../quick-reason-presets";
import { QuickReasonChips } from "../quick-reason-chips";

import { FORM_VI, POS_VI } from "@comtammatu/shared/messages";
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
  // Mirror server-side voidItemSchema (order-actions.ts): min(5). Surface
  // the rule as a counter + invalid state so cashier sees it before submit
  // rather than getting a delayed action reject.
  const reasonMinLength = 5;

  return (
    <ReasonConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
      title={itemLabel ? `Hủy món: ${itemLabel}` : POS_VI.voidItemTitleFallback}
      description={POS_VI.voidItemSrDescription}
      descriptionClassName="sr-only"
      reasonId="void-reason"
      reason={reason}
      onReasonChange={onReasonChange}
      reasonLabel={FORM_VI.reason}
      reasonPlaceholder={POS_VI.reasonMin5Placeholder}
      reasonMinLength={reasonMinLength}
      reasonControls={
        <QuickReasonChips
          presets={VOID_ITEM_PRESETS}
          value={reason}
          onChange={onReasonChange}
          ariaLabel={POS_VI.voidItemReasonSuggestAria}
        />
      }
      cancelLabel={POS_VI.keepItem}
      confirmLabel={POS_VI.voidItem}
      confirmVariant="destructive"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
}
