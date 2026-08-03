"use client";

import { useMemo } from "react";
import { X as IconX } from "lucide-react";
import {
  useController,
  type Control,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldLabel,
  FieldSet,
} from "@comtammatu/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  RadioGroup,
  RadioGroupItem,
} from "@comtammatu/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  FormDialog,
  FormattedNumberInput,
  QuantityField,
  SelectField,
  TextField,
} from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { createIngredient, updateIngredient } from "../ingredient-actions";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@lib/inventory/types";
import { parseOptionalNumber } from "@lib/inventory/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  buildCatalogUnits,
  IngredientUnitModelError,
  readCatalogUnitModel,
  rebaseUnitFactors,
  standardFactor,
} from "./ingredient-unit-form-model";

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
    unit_ids: z
      .array(z.string().trim().min(1))
      .min(1, { error: copy.units.selectUnit })
      .max(20, { error: copy.units.maxReached }),
    base_unit_id: z.string().trim().min(1, { error: copy.units.selectBase }),
    unit_factors: z.record(z.string(), z.string()),
  })
  .superRefine((data, ctx) => {
    if (!data.unit_ids.includes(data.base_unit_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["base_unit_id"],
        message: copy.units.baseMustBeSelected,
      });
    }
    for (const unitId of new Set(data.unit_ids)) {
      if (unitId === data.base_unit_id) continue;
      const factor = Number(data.unit_factors[unitId]);
      if (!Number.isFinite(factor) || factor <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["unit_factors", unitId],
          message: copy.units.factorPositive,
        });
      }
    }
  });

type IngredientFormValues = z.infer<typeof ingredientSchema>;

function toFormValues(ingredient: IngredientRow | null): IngredientFormValues {
  const activeUnits = (ingredient?.units ?? []).filter(
    (unit) => unit.is_active,
  );
  const unitModel = readCatalogUnitModel(
    activeUnits,
    activeUnits[0]?.unit_id ?? null,
  );

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
    unit_ids: activeUnits.map((unit) => String(unit.unit_id)),
    base_unit_id: String(unitModel.baseUnitId ?? ""),
    unit_factors: Object.fromEntries(
      Object.entries(unitModel.factors).map(([unitId, factor]) => [
        unitId,
        String(factor),
      ]),
    ),
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
    try {
      const units = buildCatalogUnits({
        unitIds: values.unit_ids.map(Number),
        baseUnitId: Number(values.base_unit_id),
        factors: Object.fromEntries(
          Object.entries(values.unit_factors).map(([id, factor]) => [
            Number(id),
            Number(factor),
          ]),
        ),
        unitOptions,
      });
      const categoryId =
        values.category_id && values.category_id !== NO_CATEGORY
          ? Number(values.category_id)
          : null;
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
      };
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
    } catch (error) {
      if (
        error instanceof IngredientUnitModelError &&
        error.message === "standard_unit_dimension_mismatch"
      ) {
        return { success: false, error: copy.units.dimensionMismatch };
      }
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
        <IngredientDialogFields
          form={form}
          categorySelectOptions={categorySelectOptions}
          unitSelectOptions={unitSelectOptions}
          unitOptions={unitOptions}
        />
      )}
    </FormDialog>
  );
}

function IngredientDialogFields({
  form,
  categorySelectOptions,
  unitSelectOptions,
  unitOptions,
}: {
  form: UseFormReturn<IngredientFormValues>;
  categorySelectOptions: Array<{ value: string; label: string }>;
  unitSelectOptions: Array<{ value: string; label: string }>;
  unitOptions: UnitOption[];
}) {
  const itemKind = form.watch("item_kind");
  const unitIds = form.watch("unit_ids");
  const baseUnitId = form.watch("base_unit_id");
  const unitFactors = form.watch("unit_factors");
  const { field: baseField, fieldState: baseFieldState } = useController({
    control: form.control,
    name: "base_unit_id",
  });
  const selectedUnitIds = [...new Set(unitIds.map(Number))];
  const unitsById = new Map(unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(Number(baseUnitId));
  const availableUnitOptions = unitSelectOptions.filter(
    (option) => !unitIds.includes(option.value),
  );

  function factorFor(unitId: number): number {
    if (unitId === Number(baseUnitId)) return 1;
    const unit = unitsById.get(unitId);
    if (unit?.is_standard && baseUnit?.is_standard) {
      return standardFactor(unit, baseUnit);
    }
    return Number(unitFactors[String(unitId)]);
  }

  function addUnit(nextValue: string) {
    if (!nextValue || unitIds.includes(nextValue) || unitIds.length >= 20)
      return;
    form.setValue("unit_ids", [...unitIds, nextValue], {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (!baseUnitId) {
      form.setValue("base_unit_id", nextValue, { shouldValidate: true });
      form.setValue(`unit_factors.${nextValue}`, "1");
    } else {
      const nextUnit = unitsById.get(Number(nextValue));
      if (nextUnit?.is_standard && baseUnit?.is_standard) {
        try {
          form.setValue(
            `unit_factors.${nextValue}`,
            String(standardFactor(nextUnit, baseUnit)),
            { shouldValidate: true },
          );
        } catch {
          form.setValue(`unit_factors.${nextValue}`, "", {
            shouldValidate: true,
          });
        }
      }
    }
    form.clearErrors("base_unit_id");
  }

  function removeUnit(unitId: number) {
    if (selectedUnitIds.length <= 1) return;
    const nextUnitIds = unitIds.filter((id) => Number(id) !== unitId);
    if (unitId === Number(baseUnitId)) {
      const nextBaseId = nextUnitIds[0];
      if (!nextBaseId || !changeBase(nextBaseId)) return;
      baseField.onChange(nextBaseId);
    }
    form.setValue("unit_ids", nextUnitIds, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function changeBase(nextBaseId: string): boolean {
    if (!baseUnitId) return true;
    try {
      const factors = Object.fromEntries(
        selectedUnitIds.map((unitId) => [unitId, factorFor(unitId)]),
      );
      const rebased = rebaseUnitFactors(factors, Number(nextBaseId));
      for (const [unitId, factor] of Object.entries(rebased)) {
        form.setValue(`unit_factors.${unitId}`, String(factor), {
          shouldValidate: true,
        });
      }
      form.clearErrors("base_unit_id");
      return true;
    } catch {
      form.setError("base_unit_id", {
        type: "manual",
        message: copy.units.invalidBaseFactor,
      });
      return false;
    }
  }

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
        <QuantityField
          control={form.control}
          name="min_stock_level"
          label={dialogCopy.minStockLabel}
        />
        <SelectField
          control={form.control}
          name="default_fulfill_site_kind"
          label={dialogCopy.defaultFulfillSiteKindLabel}
          options={[
            {
              value: FULFILL_SITE_NONE,
              label: dialogCopy.defaultFulfillSiteKindNone,
            },
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
        <Field orientation="horizontal" className="sm:col-span-2">
          <FieldLabel htmlFor="item-kind-finished-good">
            {dialogCopy.finishedGoodLabel}
          </FieldLabel>
          <Switch
            id="item-kind-finished-good"
            checked={itemKind === "finished_good"}
            onCheckedChange={(checked) =>
              form.setValue(
                "item_kind",
                checked ? "finished_good" : "raw_material",
              )
            }
          />
        </Field>
      </div>

      <FieldSet data-invalid={Boolean(baseFieldState.error)}>
        <FieldLegend id="base-unit-label">
          {copy.units.sectionLabel}
        </FieldLegend>
        <FieldDescription id="base-unit-description">
          {copy.units.baseUnitDescription}
        </FieldDescription>
        {availableUnitOptions.length > 0 && unitIds.length < 20 ? (
          <Select value="" onValueChange={addUnit}>
            <SelectTrigger className="w-full" aria-label={copy.units.add}>
              <SelectValue placeholder={copy.units.add} />
            </SelectTrigger>
            <SelectContent>
              {availableUnitOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {selectedUnitIds.length > 0 ? (
          <RadioGroup
            value={baseField.value ?? ""}
            onValueChange={(value) => {
              if (changeBase(value)) baseField.onChange(value);
            }}
            onBlur={baseField.onBlur}
            aria-labelledby="base-unit-label"
            aria-describedby="base-unit-description"
          >
            <ItemGroup className="gap-2">
              {selectedUnitIds.map((unitId) => {
                const optionId = `base-unit-${unitId}`;

                return (
                  <Item
                    key={unitId}
                    variant="outline"
                    size="sm"
                    role="listitem"
                  >
                    <RadioGroupItem id={optionId} value={String(unitId)} />
                    <FieldLabel
                      htmlFor={optionId}
                      className="min-w-0 flex-1 cursor-pointer font-normal"
                    >
                      <ItemContent>
                        <ItemTitle>
                          {unitsById.get(unitId)?.name ?? copy.units.unitPending}
                        </ItemTitle>
                      </ItemContent>
                    </FieldLabel>
                    <ItemActions className="flex-wrap justify-end">
                      {unitId === Number(baseUnitId) ? (
                        <Badge variant="secondary">{copy.units.baseTag}</Badge>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={selectedUnitIds.length === 1}
                        aria-label={`${copy.units.remove} ${unitsById.get(unitId)?.name ?? ""}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeUnit(unitId);
                        }}
                      >
                        <IconX />
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </RadioGroup>
        ) : null}
        {baseFieldState.error ? (
          <FieldError errors={[baseFieldState.error]} />
        ) : null}
      </FieldSet>

      {selectedUnitIds.length > 1 && baseUnit ? (
        <FieldSet>
          <FieldLegend>
            {copy.units.conversionSection(baseUnit.name)}
          </FieldLegend>
          <ItemGroup className="gap-2">
            {selectedUnitIds
              .filter((unitId) => unitId !== Number(baseUnitId))
              .map((unitId) => (
                <UnitFactorField
                  key={unitId}
                  control={form.control}
                  unit={unitsById.get(unitId)}
                  baseUnit={baseUnit}
                />
              ))}
          </ItemGroup>
        </FieldSet>
      ) : null}
    </>
  );
}

function UnitFactorField({
  control,
  unit,
  baseUnit,
}: {
  control: Control<IngredientFormValues>;
  unit: UnitOption | undefined;
  baseUnit: UnitOption | undefined;
}) {
  const name =
    `unit_factors.${unit?.id ?? 0}` as FieldPath<IngredientFormValues>;
  const { field, fieldState } = useController({ control, name });
  const controlSize = useFormControlSize("responsive");
  const automatic = Boolean(unit?.is_standard && baseUnit?.is_standard);
  let displayedValue = String(field.value ?? "");
  if (automatic && unit && baseUnit) {
    try {
      displayedValue = String(standardFactor(unit, baseUnit));
    } catch {
      displayedValue = "";
    }
  }
  const fieldId = `field-unit-factor-${unit?.id ?? 0}`;
  const errorId = fieldState.error ? `${fieldId}-error` : undefined;

  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <Item
        variant="outline"
        size="sm"
        role="listitem"
        className="flex-col items-stretch gap-3 sm:flex-row sm:flex-nowrap sm:items-center"
      >
        <ItemContent>
          <ItemTitle>{unit?.name ?? copy.units.unitPending}</ItemTitle>
        </ItemContent>
        <ItemActions className="w-full justify-between sm:w-auto sm:justify-end">
          {automatic ? (
            <>
              <span className="text-sm font-medium tabular-nums">
                {displayedValue} {baseUnit?.name ?? copy.units.unitPending}
              </span>
              <Badge variant="outline">{copy.units.autoStandard}</Badge>
            </>
          ) : (
            <InputGroup
              size={controlSize}
              className="w-full sm:w-64"
              data-invalid={Boolean(fieldState.error) || undefined}
            >
              <InputGroupAddon>
                1 {unit?.name ?? copy.units.unitPending} =
              </InputGroupAddon>
              <FormattedNumberInput
                id={fieldId}
                name={name}
                value={displayedValue}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                maxFractionDigits={12}
                aria-invalid={Boolean(fieldState.error)}
                aria-describedby={errorId}
                aria-label={copy.units.conversionAria(
                  unit?.name ?? copy.units.unitPending,
                  baseUnit?.name ?? copy.units.unitPending,
                )}
                className="h-full min-w-0"
              />
              <InputGroupAddon align="inline-end">
                {baseUnit?.name ?? copy.units.unitPending}
              </InputGroupAddon>
            </InputGroup>
          )}
        </ItemActions>
      </Item>
      {fieldState.error ? (
        <FieldError id={errorId} errors={[fieldState.error]} />
      ) : null}
    </Field>
  );
}
