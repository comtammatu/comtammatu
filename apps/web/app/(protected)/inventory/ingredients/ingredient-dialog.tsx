"use client";

import { useMemo } from "react";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  FormDialog,
  MoneyVndField,
  QuantityField,
  SelectField,
  TextField,
} from "@/components/form";
import { createIngredient, updateIngredient } from "../ingredient-actions";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@lib/inventory/types";
import { ITEM_KIND_OPTIONS } from "../_lib/constants";
import { parseOptionalNumber } from "@lib/inventory/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

const copy = messages.inventoryMaster.ingredientForm;
const dialogCopy = messages.inventory.ingredients.dialog;
const NO_CATEGORY = "none";

const ingredientSchema = z
  .object({
    name: z.string().trim().min(1, { error: dialogCopy.nameRequired }),
    sku: z.string().trim().optional(),
    category_id: z.string().trim().optional(),
    unit_cost: z.string().optional(),
    item_kind: z.enum(["raw_material", "finished_good"]),
    min_stock_level: z.string().optional(),
    input_unit_id: z.string().trim().min(1, { error: copy.units.selectUnit }),
    output_unit_id: z.string().trim().min(1, { error: copy.units.selectUnit }),
    input_to_output_factor: z
      .string()
      .trim()
      .min(1, { error: copy.units.factorPositive })
      .refine((value) => Number(value) > 0, {
        error: copy.units.factorPositive,
      }),
  })
  .superRefine((data, ctx) => {
    if (
      data.input_unit_id === data.output_unit_id &&
      Number(data.input_to_output_factor) !== 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["input_to_output_factor"],
        message: copy.units.sameUnitFactorOne,
      });
    }
  });

type IngredientFormValues = z.infer<typeof ingredientSchema>;

function toFormValues(ingredient: IngredientRow | null): IngredientFormValues {
  const outputUnit = ingredient?.units?.find((unit) => unit.is_base);
  const inputUnit =
    ingredient?.units
      ?.filter((unit) => unit.is_active && !unit.is_base)
      .sort((left, right) => right.to_base_factor - left.to_base_factor)[0] ??
    outputUnit;

  return {
    name: ingredient?.name ?? "",
    sku: ingredient?.sku ?? "",
    category_id:
      ingredient?.category_id != null ? String(ingredient.category_id) : "",
    unit_cost:
      ingredient?.unit_cost != null ? String(ingredient.unit_cost) : "",
    item_kind:
      (ingredient?.item_kind as "raw_material" | "finished_good" | undefined) ??
      "raw_material",
    min_stock_level:
      ingredient?.min_stock_level != null
        ? String(ingredient.min_stock_level)
        : "",
    input_unit_id: String(inputUnit?.unit_id ?? ""),
    output_unit_id: String(outputUnit?.unit_id ?? ""),
    input_to_output_factor: String(inputUnit?.to_base_factor ?? 1),
  };
}

interface IngredientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientRow | null;
  unitOptions: UnitOption[];
  categoryOptions: CategoryOption[];
  onSaved: () => void | Promise<void>;
}

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  unitOptions,
  categoryOptions,
  onSaved,
}: IngredientDialogProps) {
  const isEdit = ingredient !== null;
  const defaultValues = useMemo(() => toFormValues(ingredient), [ingredient]);
  const categorySelectOptions = useMemo(
    () => [
      { value: NO_CATEGORY, label: copy.category.none },
      ...categoryOptions.map((category) => ({
        value: String(category.id),
        label: category.name,
      })),
    ],
    [categoryOptions],
  );
  const unitSelectOptions = useMemo(
    () =>
      unitOptions.map((unit) => ({
        value: String(unit.id),
        label: unit.name,
      })),
    [unitOptions],
  );

  async function handleSubmit(values: IngredientFormValues) {
    const categoryId =
      values.category_id && values.category_id !== NO_CATEGORY
        ? Number(values.category_id)
        : null;
    const inputUnitId = Number(values.input_unit_id);
    const outputUnitId = Number(values.output_unit_id);
    const inputToOutputFactor = Number(values.input_to_output_factor);
    const units = ingredient?.units?.length
      ? ingredient.units
          .slice()
          .sort((left, right) => left.sort_order - right.sort_order)
          .map((unit) => ({
            unit_id: unit.unit_id,
            to_base_factor: unit.to_base_factor,
            is_base: unit.is_base,
            anchor_unit_id: unit.anchor_unit_id ?? null,
            anchor_factor: unit.anchor_factor ?? null,
          }))
      : [
          {
            unit_id: outputUnitId,
            to_base_factor: 1,
            is_base: true,
            anchor_unit_id: null,
            anchor_factor: null,
          },
          ...(inputUnitId === outputUnitId
            ? []
            : [
                {
                  unit_id: inputUnitId,
                  to_base_factor: inputToOutputFactor,
                  is_base: false,
                  anchor_unit_id: outputUnitId,
                  anchor_factor: inputToOutputFactor,
                },
              ]),
        ];
    const storageType: "ambient" | "refrigerated" | "frozen" =
      ingredient?.storage_type === "refrigerated" ||
      ingredient?.storage_type === "frozen"
        ? ingredient.storage_type
        : "ambient";
    const payload = {
      name: values.name,
      sku: values.sku || undefined,
      category_id: categoryId,
      unit_cost: parseOptionalNumber(values.unit_cost),
      item_kind: values.item_kind,
      storage_type: storageType,
      min_stock_level: parseOptionalNumber(values.min_stock_level) ?? 0,
      units,
    };

    try {
      const result =
        isEdit && ingredient
          ? await updateIngredient(ingredient.id, payload)
          : await createIngredient(payload);

      if (result.success) {
        try {
          await onSaved();
        } catch {
          toast.error(dialogCopy.reloadAfterSaveFailed);
        }
      }
      return result;
    } catch {
      return { success: false, error: dialogCopy.saveFailed };
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={ingredientSchema}
      defaultValues={defaultValues}
      entityKey={ingredient?.id ?? "new-ingredient"}
      title={isEdit ? dialogCopy.editTitle : dialogCopy.addTitle}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      successMessage={isEdit ? dialogCopy.editSuccess : dialogCopy.addSuccess}
      contentClassName="sm:max-w-2xl"
      onSubmit={handleSubmit}
    >
      {(form) => (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="name"
              label={dialogCopy.nameLabel}
              placeholder={dialogCopy.namePlaceholder}
              required
            />
            <TextField
              control={form.control}
              name="sku"
              label={dialogCopy.skuLabel}
              placeholder="SKU-001"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="category_id"
              label={copy.category.label}
              placeholder={copy.category.placeholder}
              options={categorySelectOptions}
            />
            <SelectField
              control={form.control}
              name="item_kind"
              label={dialogCopy.itemKindLabel}
              options={ITEM_KIND_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="input_unit_id"
              label={copy.units.inputUnit}
              placeholder={copy.units.selectUnit}
              options={unitSelectOptions}
              disabled={isEdit}
              required
            />
            <SelectField
              control={form.control}
              name="output_unit_id"
              label={copy.units.outputUnit}
              placeholder={copy.units.selectUnit}
              options={unitSelectOptions}
              disabled={isEdit}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <QuantityField
              control={form.control}
              name="input_to_output_factor"
              label={copy.units.inputToOutputFactor}
              disabled={isEdit}
              maxFractionDigits={6}
              required
            />
            <MoneyVndField
              control={form.control}
              name="unit_cost"
              label={dialogCopy.referenceCostLabel}
              placeholder="0"
            />
          </div>

          <QuantityField
            control={form.control}
            name="min_stock_level"
            label={dialogCopy.minStockLabel}
          />
        </>
      )}
    </FormDialog>
  );
}
