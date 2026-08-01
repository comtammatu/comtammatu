"use client";

import { z } from "zod";
import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { Field, FieldError, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { FormDialog, NumberField, TextareaField } from "@/components/form";
import { getIssueBaseQuantity } from "../_lib/issue-units";
import { adjustStock } from "../stock-actions";
import {
  getDefaultIngredientUnit,
  getIngredientUnitOptions,
} from "@lib/inventory/unit-options";
import type { StockIngredient } from "@lib/inventory/stock-on-hand-model";

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
  entryUnitId: z.string().min(1, { error: INVENTORY_VI.unitRequired }),
  reason: z.string().trim().min(5, {
    error: INVENTORY_VI.adjustReasonRequired,
  }),
});

type AdjustStockFormValues = z.infer<typeof adjustStockSchema>;

const DEFAULT_VALUES: AdjustStockFormValues = {
  quantity_change: "",
  entryUnitId: "",
  reason: "",
};

export interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  ingredient: StockIngredient;
  onAdjusted: () => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  branchId,
  ingredient,
  onAdjusted,
}: AdjustStockDialogProps) {
  const unitOptions = getIngredientUnitOptions(ingredient, {
    includeToBaseFactor: true,
  });
  const defaultUnit =
    unitOptions.find((option) => option.unitId === ingredient.issue_unit_id) ??
    getDefaultIngredientUnit(unitOptions);
  const defaultValues = {
    ...DEFAULT_VALUES,
    entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
  };

  async function handleSubmit(values: AdjustStockFormValues) {
    const parsedQuantityChange = Number(values.quantity_change);
    const selectedUnit = unitOptions.find(
      (option) => String(option.unitId) === values.entryUnitId,
    );
    if (!selectedUnit) {
      return { success: false, error: INVENTORY_VI.unitRequired };
    }
    const baseQuantityChange =
      getIssueBaseQuantity(Math.abs(parsedQuantityChange), selectedUnit) *
      Math.sign(parsedQuantityChange);
    const result = await adjustStock({
      branchId,
      ingredientId: ingredient.id,
      quantityChange: baseQuantityChange,
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
      defaultValues={defaultValues}
      entityKey={`adjust-${ingredient.id}`}
      title={INVENTORY_VI.adjustStockTitle}
      description={INVENTORY_VI.adjustIngredientLine(ingredient.name)}
      submitLabel={ACTIONS_VI.confirm}
      successMessage={INVENTORY_VI.adjustStockSuccess(ingredient.name)}
      contentClassName="sm:max-w-sm"
      onSubmit={handleSubmit}
    >
      {(form) => {
        const selectedUnit = unitOptions.find(
          (option) => String(option.unitId) === form.watch("entryUnitId"),
        );
        const unitError = form.formState.errors.entryUnitId;
        return (
          <>
            <NumberField
              control={form.control}
              name="quantity_change"
              label={INVENTORY_VI.adjustQuantityLabel(
                selectedUnit?.label ?? "",
              )}
              allowNegative
              maxFractionDigits={3}
              placeholder={INVENTORY_VI.adjustQuantityPlaceholder}
              required
            />

            <Field data-invalid={!!unitError}>
              <FieldLabel htmlFor="adjust-stock-unit">
                {FORM_VI.unit} *
              </FieldLabel>
              <Select
                value={form.watch("entryUnitId")}
                onValueChange={(value) =>
                  form.setValue("entryUnitId", value, { shouldValidate: true })
                }
                disabled={unitOptions.length === 0}
              >
                <SelectTrigger
                  id="adjust-stock-unit"
                  size="field"
                  className="w-full"
                >
                  <SelectValue placeholder={INVENTORY_VI.selectUnit} />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((option) => (
                    <SelectItem
                      key={option.unitId}
                      value={String(option.unitId)}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unitError ? <FieldError errors={[unitError]} /> : null}
            </Field>

            <TextareaField
              control={form.control}
              name="reason"
              label={INVENTORY_VI.adjustReasonLabel}
              placeholder={INVENTORY_VI.adjustReasonPlaceholder}
              rows={3}
              required
            />
          </>
        );
      }}
    </FormDialog>
  );
}
