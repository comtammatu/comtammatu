"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useController,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  FormDialog,
  FormattedNumberInput,
  QuantityField,
  SelectField,
  TextField,
} from "@/components/form";
import {
  createIngredient,
  fetchIngredientUnitLock,
  updateIngredient,
} from "../ingredient-actions";
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
type UnitLockState = "unlocked" | "locked" | "checking" | "unavailable";

type CatalogUnitPayload = {
  unit_id: number;
  to_base_factor: number;
  is_base: boolean;
  anchor_unit_id: number | null;
  anchor_factor: number | null;
};

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

function buildUnitsFromForm(
  inputUnitId: number,
  outputUnitId: number,
  inputToOutputFactor: number,
): CatalogUnitPayload[] {
  return [
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
}

function preserveExistingUnits(
  units: NonNullable<IngredientRow["units"]>,
): CatalogUnitPayload[] {
  return units
    .slice()
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((unit) => ({
      unit_id: unit.unit_id,
      to_base_factor: unit.to_base_factor,
      is_base: unit.is_base,
      anchor_unit_id: unit.anchor_unit_id ?? null,
      anchor_factor: unit.anchor_factor ?? null,
    }));
}

function ConversionFactorField({
  control,
  inputUnitName,
  outputUnitName,
  sameUnit,
  disabled,
}: {
  control: Control<IngredientFormValues>;
  inputUnitName: string;
  outputUnitName: string;
  sameUnit: boolean;
  disabled: boolean;
}) {
  const { field, fieldState } = useController({
    control,
    name: "input_to_output_factor",
  });
  const hasError = !!fieldState.error;
  const fieldId = "field-input_to_output_factor";
  const errorId = hasError ? `${fieldId}-error` : undefined;
  const value =
    typeof field.value === "string"
      ? field.value
      : field.value != null
        ? String(field.value)
        : "";
  const ariaLabel =
    inputUnitName !== copy.units.unitPending &&
    outputUnitName !== copy.units.unitPending
      ? copy.units.conversionAria(inputUnitName, outputUnitName)
      : copy.units.conversionAriaFallback;

  return (
    <Field data-invalid={hasError}>
      <FieldLabel htmlFor={fieldId}>
        {copy.units.conversion}
        {" *"}
      </FieldLabel>
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">1</span>
        <span className="text-sm font-medium">{inputUnitName}</span>
        <span className="text-sm text-muted-foreground">=</span>
        <FormattedNumberInput
          id={fieldId}
          name="input_to_output_factor"
          value={value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          maxFractionDigits={6}
          disabled={disabled || sameUnit}
          aria-invalid={hasError}
          aria-describedby={errorId}
          aria-label={ariaLabel}
          className="w-28"
        />
        <span className="text-sm font-medium">{outputUnitName}</span>
      </div>
      {fieldState.error ? (
        <FieldError id={errorId} errors={[fieldState.error]} />
      ) : null}
    </Field>
  );
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
  const [unitLock, setUnitLock] = useState<UnitLockState>(
    ingredient ? "checking" : "unlocked",
  );
  const unitLockRef = useRef(unitLock);
  unitLockRef.current = unitLock;
  const unitsLocked = unitLock !== "unlocked";

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

  useEffect(() => {
    if (!open) return;
    if (!ingredient) {
      setUnitLock("unlocked");
      return;
    }

    let cancelled = false;
    setUnitLock("checking");
    void fetchIngredientUnitLock(ingredient.id).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.data) {
        setUnitLock("unavailable");
        return;
      }
      setUnitLock(result.data.locked ? "locked" : "unlocked");
    });

    return () => {
      cancelled = true;
    };
  }, [ingredient, open]);

  async function handleSubmit(values: IngredientFormValues) {
    const categoryId =
      values.category_id && values.category_id !== NO_CATEGORY
        ? Number(values.category_id)
        : null;
    const inputUnitId = Number(values.input_unit_id);
    const outputUnitId = Number(values.output_unit_id);
    const inputToOutputFactor = Number(values.input_to_output_factor);
    const existingUnits = ingredient?.units;
    const units =
      isEdit &&
      unitLockRef.current !== "unlocked" &&
      existingUnits &&
      existingUnits.length > 0
        ? preserveExistingUnits(existingUnits)
        : buildUnitsFromForm(inputUnitId, outputUnitId, inputToOutputFactor);
    const storageType: "ambient" | "refrigerated" | "frozen" =
      ingredient?.storage_type === "refrigerated" ||
      ingredient?.storage_type === "frozen"
        ? ingredient.storage_type
        : "ambient";
    const payload = {
      name: values.name,
      sku: values.sku || undefined,
      category_id: categoryId,
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

  const unitLockHint =
    unitLock === "checking"
      ? copy.units.lockChecking
      : unitLock === "locked"
        ? copy.units.lockedHint
        : unitLock === "unavailable"
          ? copy.units.lockUnavailable
          : null;

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
      {(form) => {
        const inputUnitId = form.watch("input_unit_id");
        const outputUnitId = form.watch("output_unit_id");
        const sameUnit =
          inputUnitId.length > 0 && inputUnitId === outputUnitId;
        const inputUnitName =
          unitOptions.find((unit) => String(unit.id) === inputUnitId)?.name ??
          copy.units.unitPending;
        const outputUnitName =
          unitOptions.find((unit) => String(unit.id) === outputUnitId)?.name ??
          copy.units.unitPending;

        return (
          <IngredientDialogFields
            form={form}
            categorySelectOptions={categorySelectOptions}
            unitSelectOptions={unitSelectOptions}
            inputUnitName={inputUnitName}
            outputUnitName={outputUnitName}
            sameUnit={sameUnit}
            unitsLocked={unitsLocked}
            unitLockHint={unitLockHint}
          />
        );
      }}
    </FormDialog>
  );
}

function IngredientDialogFields({
  form,
  categorySelectOptions,
  unitSelectOptions,
  inputUnitName,
  outputUnitName,
  sameUnit,
  unitsLocked,
  unitLockHint,
}: {
  form: UseFormReturn<IngredientFormValues>;
  categorySelectOptions: Array<{ value: string; label: string }>;
  unitSelectOptions: Array<{ value: string; label: string }>;
  inputUnitName: string;
  outputUnitName: string;
  sameUnit: boolean;
  unitsLocked: boolean;
  unitLockHint: string | null;
}) {
  useEffect(() => {
    if (unitsLocked || !sameUnit) return;
    if (form.getValues("input_to_output_factor") === "1") return;
    form.setValue("input_to_output_factor", "1", { shouldValidate: true });
  }, [form, sameUnit, unitsLocked]);

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
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
        <SelectField
          control={form.control}
          name="input_unit_id"
          label={copy.units.inputUnit}
          placeholder={copy.units.selectUnit}
          options={unitSelectOptions}
          disabled={unitsLocked}
          required
        />
        <SelectField
          control={form.control}
          name="output_unit_id"
          label={copy.units.outputUnit}
          placeholder={copy.units.selectUnit}
          options={unitSelectOptions}
          disabled={unitsLocked}
          required
        />
      </div>

      {!unitsLocked ? (
        <FieldDescription>{copy.units.unitsBriefHint}</FieldDescription>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <ConversionFactorField
          control={form.control}
          inputUnitName={inputUnitName}
          outputUnitName={outputUnitName}
          sameUnit={sameUnit}
          disabled={unitsLocked}
        />
        <QuantityField
          control={form.control}
          name="min_stock_level"
          label={dialogCopy.minStockLabel}
        />
      </div>

      {unitLockHint ? (
        <FieldDescription>{unitLockHint}</FieldDescription>
      ) : null}
    </>
  );
}
