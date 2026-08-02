"use client";

import { useMemo } from "react";
import {
  useController,
  type Control,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import { Badge } from "@comtammatu/ui/components/badge";
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
  distinctRoleUnitIds,
  IngredientUnitModelError,
  readCatalogUnitModel,
  rebaseUnitFactors,
  standardFactor,
  type UnitRoles,
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
    input_unit_id: z.string().trim().min(1, { error: copy.units.selectUnit }),
    output_unit_id: z.string().trim().min(1, { error: copy.units.selectUnit }),
    base_unit_id: z.string().trim().min(1, { error: copy.units.selectBase }),
    unit_factors: z.record(z.string(), z.string()),
  })
  .superRefine((data, ctx) => {
    const roleIds = [
      data.input_unit_id,
      data.output_unit_id,
    ].filter((id): id is string => Boolean(id));

    if (!roleIds.includes(data.base_unit_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["base_unit_id"],
        message: copy.units.baseMustBeRole,
      });
    }
    for (const unitId of new Set(roleIds)) {
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
type RoleFieldName = "input_unit_id" | "output_unit_id";

function toFormValues(ingredient: IngredientRow | null): IngredientFormValues {
  const baseUnit = ingredient?.units?.find((unit) => unit.is_base);
  const outputUnit =
    ingredient?.units?.find(
      (unit) => unit.unit_id === ingredient.issue_unit_id,
    ) ?? baseUnit;
  const inputUnit =
    ingredient?.units?.find(
      (unit) => unit.unit_id === ingredient.receipt_unit_id,
    ) ?? outputUnit;
  const unitModel = readCatalogUnitModel(
    ingredient?.units ?? [],
    outputUnit?.unit_id ?? null,
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
    input_unit_id: String(inputUnit?.unit_id ?? ""),
    output_unit_id: String(outputUnit?.unit_id ?? ""),
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
    const inputUnitId = Number(values.input_unit_id);
    const outputUnitId = Number(values.output_unit_id);
    try {
      const units = buildCatalogUnits({
        roles: {
          receiptUnitId: inputUnitId,
          issueUnitId: outputUnitId,
          productionUnitId: null,
        },
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
        receipt_unit_id: inputUnitId,
        issue_unit_id: outputUnitId,
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
  const inputUnitId = form.watch("input_unit_id");
  const outputUnitId = form.watch("output_unit_id");
  const baseUnitId = form.watch("base_unit_id");
  const unitFactors = form.watch("unit_factors");
  const { field: baseField, fieldState: baseFieldState } = useController({
    control: form.control,
    name: "base_unit_id",
  });
  const roles: UnitRoles = {
    receiptUnitId: Number(inputUnitId),
    issueUnitId: Number(outputUnitId),
    productionUnitId: null,
  };
  const roleUnitIds = distinctRoleUnitIds(roles);
  const unitsById = new Map(unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(Number(baseUnitId));

  function factorFor(unitId: number): number {
    if (unitId === Number(baseUnitId)) return 1;
    const unit = unitsById.get(unitId);
    if (unit?.is_standard && baseUnit?.is_standard) {
      return standardFactor(unit, baseUnit);
    }
    return Number(unitFactors[String(unitId)]);
  }

  function changeRole(name: RoleFieldName, nextValue: string): boolean {
    const nextRoles = {
      input_unit_id: name === "input_unit_id" ? nextValue : inputUnitId,
      output_unit_id: name === "output_unit_id" ? nextValue : outputUnitId,
    };
    const selected = [
      nextRoles.input_unit_id,
      nextRoles.output_unit_id,
    ].filter(Boolean);
    if (baseUnitId && !selected.includes(baseUnitId)) {
      form.setError("base_unit_id", {
        type: "manual",
        message: copy.units.chooseBaseBeforeRoleChange,
      });
      return false;
    }

    if (name === "output_unit_id" && !inputUnitId) {
      form.setValue("input_unit_id", nextValue, { shouldValidate: true });
    }
    if (!baseUnitId && name === "output_unit_id") {
      form.setValue("base_unit_id", nextValue, { shouldValidate: true });
      form.setValue(`unit_factors.${nextValue}`, "1");
      const nextBaseUnit = unitsById.get(Number(nextValue));
      for (const selectedUnitId of new Set(selected)) {
        const selectedUnit = unitsById.get(Number(selectedUnitId));
        if (
          selectedUnitId !== nextValue &&
          selectedUnit?.is_standard &&
          nextBaseUnit?.is_standard
        ) {
          try {
            form.setValue(
              `unit_factors.${selectedUnitId}`,
              String(standardFactor(selectedUnit, nextBaseUnit)),
              { shouldValidate: true },
            );
          } catch {
            form.setValue(`unit_factors.${selectedUnitId}`, "", {
              shouldValidate: true,
            });
          }
        }
      }
    } else if (baseUnitId) {
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
    return true;
  }

  function changeBase(nextBaseId: string): boolean {
    if (!baseUnitId) return true;
    try {
      const factors = Object.fromEntries(
        roleUnitIds.map((unitId) => [unitId, factorFor(unitId)]),
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

      <FieldSet>
        <FieldLegend>{copy.units.roleSectionLabel}</FieldLegend>
        <FieldDescription>{copy.units.hint}</FieldDescription>
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <GuardedSelectField
            control={form.control}
            name="input_unit_id"
            label={copy.units.inputUnit}
            options={unitSelectOptions}
            onChange={(value) => changeRole("input_unit_id", value)}
          />
          <GuardedSelectField
            control={form.control}
            name="output_unit_id"
            label={copy.units.outputUnit}
            options={unitSelectOptions}
            onChange={(value) => changeRole("output_unit_id", value)}
          />
        </div>
      </FieldSet>

      <FieldSet data-invalid={Boolean(baseFieldState.error)}>
        <FieldLegend id="base-unit-label">{copy.units.baseUnit} *</FieldLegend>
        <FieldDescription id="base-unit-description">
          {copy.units.baseUnitDescription}
        </FieldDescription>
        {roleUnitIds.length === 1 && baseUnitId ? (
          <Item variant="muted" size="sm">
            <ItemContent>
              <ItemTitle>
                {unitsById.get(roleUnitIds[0] ?? 0)?.name ??
                  copy.units.unitPending}
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary">{copy.units.baseTag}</Badge>
            </ItemActions>
          </Item>
        ) : roleUnitIds.length > 0 ? (
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
              {roleUnitIds.map((unitId) => {
                const optionId = `base-unit-${unitId}`;
                const roleLabels = [
                  inputUnitId === String(unitId) ? copy.units.inputRole : null,
                  outputUnitId === String(unitId)
                    ? copy.units.outputRole
                    : null,
                ].filter((label) => label !== null);

                return (
                  <Item
                    key={unitId}
                    variant="outline"
                    size="sm"
                    role="listitem"
                    className="cursor-pointer"
                    render={
                      <FieldLabel
                        htmlFor={optionId}
                        className="w-full items-center gap-3 font-normal"
                      />
                    }
                  >
                    <RadioGroupItem id={optionId} value={String(unitId)} />
                    <ItemContent>
                      <ItemTitle>
                        {unitsById.get(unitId)?.name ?? copy.units.unitPending}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions className="flex-wrap justify-end">
                      {roleLabels.map((label) => (
                        <Badge key={label} variant="outline">
                          {label}
                        </Badge>
                      ))}
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

      {roleUnitIds.length > 0 && baseUnit ? (
        <FieldSet>
          <FieldLegend>
            {copy.units.conversionSection(baseUnit.name)}
          </FieldLegend>
          <ItemGroup className="gap-2">
            {roleUnitIds.map((unitId) => (
              <UnitFactorField
                key={unitId}
                control={form.control}
                unit={unitsById.get(unitId)}
                baseUnit={baseUnit}
                isBase={unitId === Number(baseUnitId)}
              />
            ))}
          </ItemGroup>
        </FieldSet>
      ) : null}
    </>
  );
}

function GuardedSelectField({
  control,
  name,
  label,
  options,
  value,
  required = true,
  onChange,
}: {
  control: Control<IngredientFormValues>;
  name: RoleFieldName;
  label: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  required?: boolean;
  onChange: (value: string) => boolean;
}) {
  const { field, fieldState } = useController({ control, name });
  const controlSize = useFormControlSize("responsive");
  const fieldId = `field-${name}`;
  const errorId = fieldState.error ? `${fieldId}-error` : undefined;

  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor={fieldId}>
        {label}
        {required ? " *" : null}
      </FieldLabel>
      <Select
        value={value ?? field.value ?? ""}
        onValueChange={(value) => {
          if (onChange(value)) field.onChange(value);
        }}
      >
        <SelectTrigger
          id={fieldId}
          size={controlSize}
          className="w-full"
          aria-invalid={Boolean(fieldState.error)}
          aria-describedby={errorId}
          onBlur={field.onBlur}
          ref={field.ref}
        >
          <SelectValue placeholder={copy.units.selectUnit} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {fieldState.error ? (
        <FieldError id={errorId} errors={[fieldState.error]} />
      ) : null}
    </Field>
  );
}

function UnitFactorField({
  control,
  unit,
  baseUnit,
  isBase,
}: {
  control: Control<IngredientFormValues>;
  unit: UnitOption | undefined;
  baseUnit: UnitOption | undefined;
  isBase: boolean;
}) {
  const name =
    `unit_factors.${unit?.id ?? 0}` as FieldPath<IngredientFormValues>;
  const { field, fieldState } = useController({ control, name });
  const controlSize = useFormControlSize("responsive");
  const automatic = Boolean(unit?.is_standard && baseUnit?.is_standard);
  let displayedValue = isBase ? "1" : String(field.value ?? "");
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
          {isBase ? (
            <>
              <span className="text-sm font-medium tabular-nums">
                1 {baseUnit?.name ?? copy.units.unitPending}
              </span>
              <Badge variant="secondary">{copy.units.baseTag}</Badge>
            </>
          ) : automatic ? (
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
