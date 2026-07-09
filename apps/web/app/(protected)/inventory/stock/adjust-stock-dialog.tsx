"use client";

import { z } from "zod";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { FormDialog, NumberField, TextareaField } from "@/components/form";
import { adjustStock } from "../stock-actions";

const adjustStockSchema = z.object({
  quantity_change: z
    .string()
    .trim()
    .min(1, { error: INVENTORY_VI.adjustQuantityRequired })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n !== 0;
      },
      { error: INVENTORY_VI.adjustQuantityNonZero },
    ),
  reason: z.string().trim().min(5, {
    error: INVENTORY_VI.adjustReasonRequired,
  }),
});

type AdjustStockFormValues = z.infer<typeof adjustStockSchema>;

const DEFAULT_VALUES: AdjustStockFormValues = {
  quantity_change: "",
  reason: "",
};

export interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  onAdjusted: () => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  branchId,
  ingredientId,
  ingredientName,
  unit,
  onAdjusted,
}: AdjustStockDialogProps) {
  async function handleSubmit(values: AdjustStockFormValues) {
    const parsedQuantityChange = Number(values.quantity_change);
    const result = await adjustStock({
      branchId,
      ingredientId,
      quantityChange: parsedQuantityChange,
      reason: values.reason,
    });
    if (result.success) {
      onAdjusted();
    }
    return result;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={adjustStockSchema}
      defaultValues={DEFAULT_VALUES}
      entityKey={`adjust-${ingredientId}`}
      title={INVENTORY_VI.adjustStockTitle}
      description={INVENTORY_VI.adjustIngredientLine(ingredientName)}
      submitLabel={ACTIONS_VI.confirm}
      successMessage={INVENTORY_VI.adjustStockSuccess(ingredientName)}
      contentClassName="sm:max-w-sm"
      onSubmit={handleSubmit}
    >
      {(form) => (
        <>
          <NumberField
            control={form.control}
            name="quantity_change"
            label={INVENTORY_VI.adjustQuantityLabel(unit)}
            allowNegative
            maxFractionDigits={3}
            placeholder={INVENTORY_VI.adjustQuantityPlaceholder}
            required
          />

          <TextareaField
            control={form.control}
            name="reason"
            label={INVENTORY_VI.adjustReasonLabel}
            placeholder={INVENTORY_VI.adjustReasonPlaceholder}
            rows={3}
            required
          />
        </>
      )}
    </FormDialog>
  );
}
