"use client";

import { useEffect, useMemo, useState } from "react";
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
  FieldLegend,
  FieldLabel,
  FieldSet,
} from "@comtammatu/ui/components/field";
import { Switch } from "@comtammatu/ui/components/switch";
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

const FULFILL_SITE_NONE = "none";

const ingredientSchema = z
  .object({
    name: z.string().trim().min(1, { error: dialogCopy.nameRequired }),
    sku: z.string().trim().optional(),
    category_id: z.string().trim().optional(),
    item_kind: z.enum(["raw_material", "finished_good"]),
    min_stock_level: z.string().optional(),
    default_fulfill_site_kind: z
      .enum(["none", "central_supply", "central_kitchen"])
      .optional(),
    input_unit_id: z.string().trim().min(1, { error: copy.units.selectUnit }),
    output_unit_id: z.string().trim().min(1, { error: copy.units.selectUnit }),
    input_to_output_factor: z
      .string()
      .trim()
      .min(1, { error: copy.units.factorPositive })
      .refine((value) => Number(value) > 0, {
        error: copy.units.factorPositive,
      }),
    production_enabled: z.boolean().default(false),
    production_unit_id: z.string().trim().optional(),
    output_to_production_factor: z.string().trim().optional(),
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
    if (data.production_enabled) {
      if (!data.production_unit_id) {
        ctx.addIssue({ code: "custom", path: ["production_unit_id"], message: copy.units.selectUnit });
      }
      if (!data.output_to_production_factor || Number(data.output_to_production_factor) <= 0) {
        ctx.addIssue({ code: "custom", path: ["output_to_production_factor"], message: copy.units.factorPositive });
      }
      if (data.output_unit_id === data.production_unit_id && Number(data.output_to_production_factor) !== 1) {
        ctx.addIssue({ code: "custom", path: ["output_to_production_factor"], message: copy.units.sameUnitFactorOne });
      }
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
  const baseUnit = ingredient?.units?.find((unit) => unit.is_base);
  const outputUnit = ingredient?.units?.find(
    (unit) => unit.unit_id === ingredient.issue_unit_id,
  ) ?? baseUnit;
  const inputUnit = ingredient?.units?.find(
    (unit) => unit.unit_id === ingredient.receipt_unit_id,
  ) ?? outputUnit;

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
    default_fulfill_site_kind:
      ingredient?.default_fulfill_site_kind ?? FULFILL_SITE_NONE,
    input_unit_id: String(inputUnit?.unit_id ?? ""),
    output_unit_id: String(outputUnit?.unit_id ?? ""),
    input_to_output_factor: String(
      (inputUnit?.to_base_factor ?? 1) / (outputUnit?.to_base_factor ?? 1),
    ),
    production_enabled: ingredient?.production_unit_id != null,
    production_unit_id: String(ingredient?.production_unit_id ?? ""),
    output_to_production_factor:
      ingredient?.production_unit_id != null
        ? String((outputUnit?.to_base_factor ?? 1) / (baseUnit?.to_base_factor ?? 1))
        : "1",
  };
}

function buildUnitsFromForm(
  inputUnitId: number,
  outputUnitId: number,
  inputToOutputFactor: number,
  productionUnitId: number | null,
  outputToProductionFactor: number,
): CatalogUnitPayload[] {
  const baseUnitId = productionUnitId ?? outputUnitId;
  const units = new Map<number, CatalogUnitPayload>();
  units.set(baseUnitId, {
    unit_id: baseUnitId,
    to_base_factor: 1,
    is_base: true,
    anchor_unit_id: null,
    anchor_factor: null,
  });
  if (outputUnitId !== baseUnitId) {
    units.set(outputUnitId, {
      unit_id: outputUnitId,
      to_base_factor: outputToProductionFactor,
      is_base: false,
      anchor_unit_id: baseUnitId,
      anchor_factor: outputToProductionFactor,
    });
  }
  if (inputUnitId !== outputUnitId && inputUnitId !== baseUnitId) {
    units.set(inputUnitId, {
      unit_id: inputUnitId,
      to_base_factor: inputToOutputFactor * outputToProductionFactor,
      is_base: false,
      anchor_unit_id: outputUnitId,
      anchor_factor: inputToOutputFactor,
    });
  }
  return [...units.values()];
}

function ConversionFactorField({
  control,
  name,
  fromUnitName,
  toUnitName,
  sameUnit,
}: {
  control: Control<IngredientFormValues>;
  name: "input_to_output_factor" | "output_to_production_factor";
  fromUnitName: string;
  toUnitName: string;
  sameUnit: boolean;
}) {
  const { field, fieldState } = useController({
    control,
    name,
  });
  const hasError = !!fieldState.error;
  const fieldId = `field-${name}`;
  const errorId = hasError ? `${fieldId}-error` : undefined;
  const value =
    typeof field.value === "string"
      ? field.value
      : field.value != null
        ? String(field.value)
        : "";
  const ariaLabel =
    fromUnitName !== copy.units.unitPending &&
    toUnitName !== copy.units.unitPending
      ? copy.units.conversionAria(fromUnitName, toUnitName)
      : copy.units.conversionAriaFallback;

  return (
    <Field data-invalid={hasError}>
      <FieldLabel htmlFor={fieldId}>
        {copy.units.conversion(fromUnitName, toUnitName)}
        {" *"}
      </FieldLabel>
      <div className="flex min-h-10 flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">1</span>
        <span className="text-sm font-medium">{fromUnitName}</span>
        <span className="text-sm text-muted-foreground">=</span>
        <FormattedNumberInput
          id={fieldId}
          name={name}
          value={value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          maxFractionDigits={6}
          disabled={sameUnit}
          aria-invalid={hasError}
          aria-describedby={errorId}
          aria-label={ariaLabel}
          className="w-28"
        />
        <span className="text-sm font-medium">{toUnitName}</span>
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
    const productionUnitId = values.production_enabled
      ? Number(values.production_unit_id)
      : null;
    const outputToProductionFactor = values.production_enabled
      ? Number(values.output_to_production_factor)
      : 1;
    const units = buildUnitsFromForm(
      inputUnitId,
      outputUnitId,
      inputToOutputFactor,
      productionUnitId,
      outputToProductionFactor,
    );
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
      default_fulfill_site_kind:
        values.default_fulfill_site_kind &&
        values.default_fulfill_site_kind !== FULFILL_SITE_NONE
          ? values.default_fulfill_site_kind
          : null,
      units,
      receipt_unit_id: inputUnitId,
      issue_unit_id: outputUnitId,
      production_unit_id: productionUnitId,
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
        ? copy.units.standardLockedHint
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
        const productionEnabled = form.watch("production_enabled");
        const productionUnitId = form.watch("production_unit_id");
        const sameUnit =
          inputUnitId.length > 0 && inputUnitId === outputUnitId;
        const inputUnitName =
          unitOptions.find((unit) => String(unit.id) === inputUnitId)?.name ??
          copy.units.unitPending;
        const outputUnitName =
          unitOptions.find((unit) => String(unit.id) === outputUnitId)?.name ??
          copy.units.unitPending;
        const productionUnitName =
          unitOptions.find((unit) => String(unit.id) === productionUnitId)?.name ??
          copy.units.unitPending;

        return (
          <IngredientDialogFields
            form={form}
            categorySelectOptions={categorySelectOptions}
            unitSelectOptions={unitSelectOptions}
            inputUnitName={inputUnitName}
            outputUnitName={outputUnitName}
            productionUnitName={productionUnitName}
            sameUnit={sameUnit}
            productionEnabled={productionEnabled}
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
  productionUnitName,
  sameUnit,
  productionEnabled,
  unitsLocked,
  unitLockHint,
}: {
  form: UseFormReturn<IngredientFormValues>;
  categorySelectOptions: Array<{ value: string; label: string }>;
  unitSelectOptions: Array<{ value: string; label: string }>;
  inputUnitName: string;
  outputUnitName: string;
  productionUnitName: string;
  sameUnit: boolean;
  productionEnabled: boolean;
  unitsLocked: boolean;
  unitLockHint: string | null;
}) {
  useEffect(() => {
    if (!sameUnit) return;
    if (form.getValues("input_to_output_factor") === "1") return;
    form.setValue("input_to_output_factor", "1", { shouldValidate: true });
  }, [form, sameUnit]);

  const productionSameAsOutput =
    form.watch("production_unit_id") === form.watch("output_unit_id");

  useEffect(() => {
    if (!productionEnabled || !productionSameAsOutput) return;
    if (form.getValues("output_to_production_factor") === "1") return;
    form.setValue("output_to_production_factor", "1", { shouldValidate: true });
  }, [form, productionEnabled, productionSameAsOutput]);

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
          name="default_fulfill_site_kind"
          label={dialogCopy.defaultFulfillSiteKindLabel}
          options={[
            { value: FULFILL_SITE_NONE, label: dialogCopy.defaultFulfillSiteKindNone },
            {
              value: "central_supply",
              label: dialogCopy.defaultFulfillSiteKindCentralSupply,
            },
            {
              value: "central_kitchen",
              label: dialogCopy.defaultFulfillSiteKindCentralKitchen,
            },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <QuantityField
          control={form.control}
          name="min_stock_level"
          label={dialogCopy.minStockLabel}
        />
      </div>

      <FieldSet>
        <FieldLegend>{copy.units.sectionLabel}</FieldLegend>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="input_unit_id"
            label={copy.units.inputUnit}
            placeholder={copy.units.selectUnit}
            options={unitSelectOptions}
            required
          />
          <SelectField
            control={form.control}
            name="output_unit_id"
            label={copy.units.outputUnit}
            placeholder={copy.units.selectUnit}
            options={unitSelectOptions}
            disabled={unitsLocked && !productionEnabled}
            required
          />
          <ConversionFactorField
            control={form.control}
            name="input_to_output_factor"
            fromUnitName={inputUnitName}
            toUnitName={outputUnitName}
            sameUnit={sameUnit}
          />
        </div>
        <Field className="mt-4" orientation="horizontal">
          <FieldLabel htmlFor="production-enabled">{copy.units.productionEnabled}</FieldLabel>
          <Switch
            id="production-enabled"
            checked={productionEnabled}
            disabled={unitsLocked}
            onCheckedChange={(checked) =>
              form.setValue("production_enabled", checked, { shouldValidate: true })
            }
          />
        </Field>
        {productionEnabled ? (
          <div className="mt-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="production_unit_id"
              label={copy.units.productionUnit}
              placeholder={copy.units.selectUnit}
              options={unitSelectOptions}
              disabled={unitsLocked}
              required
            />
            <ConversionFactorField
              control={form.control}
              name="output_to_production_factor"
              fromUnitName={outputUnitName}
              toUnitName={productionUnitName}
              sameUnit={productionSameAsOutput}
            />
          </div>
        ) : null}
        <FieldDescription className="mt-4">
          {copy.units.standardUnit(
            productionEnabled ? productionUnitName : outputUnitName,
          )}
        </FieldDescription>
      </FieldSet>

      {unitLockHint ? (
        <FieldDescription>{unitLockHint}</FieldDescription>
      ) : null}
    </>
  );
}
