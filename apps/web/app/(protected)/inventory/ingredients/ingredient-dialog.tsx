"use client";

import { useMemo, useState } from "react";
import { Trash2 as IconTrash } from "lucide-react";
import {
  useController,
  type Control,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldError,
  FieldLegend,
  FieldLabel,
  FieldSet,
} from "@comtammatu/ui/components/field";
import {
  Item,
  ItemActions,
  ItemGroup,
} from "@comtammatu/ui/components/item";
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
import { formatDecimal } from "@comtammatu/shared/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  buildCatalogUnits,
  deriveEffectiveUnitFactor,
  findDirectDependents,
  IngredientUnitModelError,
  isValidAnchorFactor,
  readCatalogUnitModel,
  rebaseUnitRelations,
  wouldCreateUnitCycle,
} from "./ingredient-unit-form-model";
import type {
  IngredientUnitModelErrorCode,
  UnitRelationInput,
} from "./ingredient-unit-form-model";

const copy = messages.inventoryMaster.ingredientForm;
const dialogCopy = messages.inventory.ingredients.dialog;
const NO_CATEGORY = "none";
const FULFILL_SITE_NONE = "none";

const ingredientSchemaBase = z.object({
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
  unit_anchor_ids: z.record(z.string(), z.string()),
  unit_factors: z.record(z.string(), z.string()),
});

type IngredientFormValues = z.infer<typeof ingredientSchemaBase>;

function toUnitRelations(
  values: IngredientFormValues,
  unitOptions: UnitOption[],
): UnitRelationInput {
  return {
    unitIds: values.unit_ids.map(Number),
    baseUnitId: Number(values.base_unit_id),
    anchorUnitIds: Object.fromEntries(
      Object.entries(values.unit_anchor_ids).map(([id, anchorId]) => [
        Number(id),
        anchorId ? Number(anchorId) : null,
      ]),
    ),
    anchorFactors: Object.fromEntries(
      Object.entries(values.unit_factors).map(([id, factor]) => [
        Number(id),
        factor ? factor : null,
      ]),
    ),
    unitOptions,
  };
}

function isAutomaticStandardRelation(
  unit: UnitOption | undefined,
  baseUnit: UnitOption | undefined,
  anchorUnitId: number | null,
  factor: number | string | null,
): boolean {
  return (
    anchorUnitId === baseUnit?.id &&
    factor == null &&
    unit?.is_standard === true &&
    baseUnit?.is_standard === true &&
    unit.dimension != null &&
    unit.dimension === baseUnit.dimension
  );
}

function locateUnitRelationIssue(
  relations: UnitRelationInput,
): { unitId: number; code: IngredientUnitModelErrorCode } | null {
  const selectedUnitIds = [...new Set(relations.unitIds)];
  const selectedUnitIdSet = new Set(selectedUnitIds);
  const unitsById = new Map(
    relations.unitOptions.map((unit) => [unit.id, unit]),
  );
  const baseUnit = unitsById.get(relations.baseUnitId);
  if (!baseUnit) return null;

  for (const unitId of selectedUnitIds) {
    if (unitId === relations.baseUnitId) continue;
    const unit = unitsById.get(unitId);
    const anchorUnitId = relations.anchorUnitIds[unitId] ?? null;
    const factor = relations.anchorFactors[unitId] ?? null;
    if (anchorUnitId == null || !selectedUnitIdSet.has(anchorUnitId)) {
      return { unitId, code: "anchor_unit_not_selected" };
    }
    if (wouldCreateUnitCycle(relations.anchorUnitIds, unitId, anchorUnitId)) {
      return { unitId, code: "unit_anchor_cycle" };
    }

    const automaticStandardRelation =
      anchorUnitId === baseUnit.id &&
      factor == null &&
      unit?.is_standard === true &&
      baseUnit.is_standard;
    if (automaticStandardRelation) {
      try {
        deriveEffectiveUnitFactor(relations, unitId);
      } catch (error) {
        if (error instanceof IngredientUnitModelError) {
          return {
            unitId,
            code: error.message as IngredientUnitModelErrorCode,
          };
        }
      }
      continue;
    }
    if (factor == null) {
      return { unitId, code: "invalid_factor" };
    }
    if (!isValidAnchorFactor(factor)) {
      const numericFactor = Number(factor);
      return {
        unitId,
        code:
          Number.isFinite(numericFactor) && numericFactor > 0
            ? "anchor_factor_out_of_range"
            : "invalid_factor",
      };
    }
  }

  for (const unitId of selectedUnitIds) {
    if (unitId === relations.baseUnitId) continue;
    try {
      deriveEffectiveUnitFactor(relations, unitId);
    } catch (error) {
      if (error instanceof IngredientUnitModelError) {
        return { unitId, code: error.message as IngredientUnitModelErrorCode };
      }
    }
  }

  return null;
}

function unitRelationIssue(
  error: IngredientUnitModelError,
  relations: UnitRelationInput,
): { path: (string | number)[]; message: string } {
  const issue = locateUnitRelationIssue(relations) ?? {
    unitId: undefined,
    code: error.message as IngredientUnitModelErrorCode,
  };
  const relatedPath = (
    field: "unit_anchor_ids" | "unit_factors",
    unitId?: number,
  ) => (unitId == null ? ["base_unit_id"] : [field, String(unitId)]);

  switch (issue.code) {
    case "anchor_unit_not_selected":
      return {
        path: relatedPath("unit_anchor_ids", issue.unitId),
        message: copy.units.anchorRequired,
      };
    case "unit_anchor_cycle": {
      const anchorUnitId =
        issue.unitId == null ? null : relations.anchorUnitIds[issue.unitId];
      return {
        path: relatedPath("unit_anchor_ids", issue.unitId),
        message:
          issue.unitId != null && anchorUnitId === issue.unitId
            ? copy.units.anchorSelf
            : copy.units.anchorCycle,
      };
    }
    case "invalid_factor":
      return {
        path: relatedPath("unit_factors", issue.unitId),
        message: copy.units.factorPositive,
      };
    case "anchor_factor_out_of_range":
      return {
        path: relatedPath("unit_factors", issue.unitId),
        message: copy.units.factorPrecision,
      };
    case "effective_factor_out_of_range":
      return {
        path: relatedPath("unit_factors", issue.unitId),
        message: copy.units.effectiveFactorPrecision,
      };
    case "standard_unit_dimension_mismatch":
      return {
        path: relatedPath("unit_anchor_ids", issue.unitId),
        message: copy.units.dimensionMismatch,
      };
    case "base_unit_not_selected":
    case "unit_not_found":
      return { path: ["base_unit_id"], message: copy.units.baseMustBeSelected };
    default:
      return { path: ["base_unit_id"], message: dialogCopy.saveFailed };
  }
}

function createIngredientSchema(unitOptions: UnitOption[]) {
  return ingredientSchemaBase.superRefine((data, ctx) => {
    if (!data.unit_ids.includes(data.base_unit_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["base_unit_id"],
        message: copy.units.baseMustBeSelected,
      });
    }
    const relations = toUnitRelations(data, unitOptions);
    try {
      buildCatalogUnits(relations);
    } catch (error) {
      if (!(error instanceof IngredientUnitModelError)) return;
      const issue = unitRelationIssue(error, relations);
      ctx.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
  });
}

function toFormValues(
  ingredient: IngredientRow | null,
  unitOptions: UnitOption[],
): IngredientFormValues {
  const activeUnits = (ingredient?.units ?? []).filter(
    (unit) => unit.is_active,
  );
  const unitModel = readCatalogUnitModel(
    activeUnits,
    activeUnits[0]?.unit_id ?? null,
    unitOptions,
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
    unit_anchor_ids: Object.fromEntries(
      Object.entries(unitModel.anchorUnitIds).map(([unitId, anchorUnitId]) => [
        unitId,
        anchorUnitId == null ? "" : String(anchorUnitId),
      ]),
    ),
    unit_factors: Object.fromEntries(
      Object.entries(unitModel.anchorFactors).map(([unitId, factor]) => [
        unitId,
        factor == null ? "" : String(factor),
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
  const defaultValues = useMemo(
    () => toFormValues(ingredient, unitOptions),
    [ingredient, unitOptions],
  );
  const ingredientSchema = useMemo(
    () => createIngredientSchema(unitOptions),
    [unitOptions],
  );
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
      const relations = toUnitRelations(values, unitOptions);
      const units = buildCatalogUnits(relations);
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
      if (error instanceof IngredientUnitModelError) {
        return {
          success: false,
          error: unitRelationIssue(error, toUnitRelations(values, unitOptions))
            .message,
        };
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
  const unitAnchorIds = form.watch("unit_anchor_ids");
  const unitFactors = form.watch("unit_factors");
  const [blockedRemovalErrors, setBlockedRemovalErrors] = useState<
    Record<number, string>
  >({});
  const controlSize = useFormControlSize("responsive");
  const { field: baseField, fieldState: baseFieldState } = useController({
    control: form.control,
    name: "base_unit_id",
  });
  const baseErrorId = "base-unit-error";
  const selectedUnitIds = [...new Set(unitIds.map(Number))];
  const unitsById = new Map(unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(Number(baseUnitId));
  const availableUnitOptions = unitSelectOptions.filter(
    (option) => !unitIds.includes(option.value),
  );

  const relations = useMemo<UnitRelationInput | null>(() => {
    if (!baseUnit) return null;
    return {
      unitIds: selectedUnitIds,
      baseUnitId: baseUnit.id,
      anchorUnitIds: Object.fromEntries(
        selectedUnitIds.map((unitId) => [
          unitId,
          unitId === baseUnit.id
            ? null
            : unitAnchorIds[String(unitId)]
              ? Number(unitAnchorIds[String(unitId)])
              : null,
        ]),
      ),
      anchorFactors: Object.fromEntries(
        selectedUnitIds.map((unitId) => {
          const factor = unitFactors[String(unitId)];
          return [unitId, unitId === baseUnit.id ? null : factor || null];
        }),
      ),
      unitOptions,
    };
  }, [baseUnit, selectedUnitIds, unitAnchorIds, unitFactors, unitOptions]);

  function addUnit(nextValue: string) {
    if (!nextValue || unitIds.includes(nextValue) || unitIds.length >= 20)
      return;
    form.setValue("unit_ids", [...unitIds, nextValue], {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (!baseUnitId) {
      form.setValue("base_unit_id", nextValue, { shouldValidate: true });
      form.setValue(
        "unit_anchor_ids",
        { ...unitAnchorIds, [nextValue]: "" },
        { shouldDirty: true, shouldValidate: true },
      );
      form.setValue(
        "unit_factors",
        { ...unitFactors, [nextValue]: "" },
        { shouldDirty: true, shouldValidate: true },
      );
    } else {
      form.setValue(
        "unit_anchor_ids",
        { ...unitAnchorIds, [nextValue]: baseUnitId },
        { shouldDirty: true, shouldValidate: true },
      );
      form.setValue(
        "unit_factors",
        { ...unitFactors, [nextValue]: "" },
        { shouldDirty: true, shouldValidate: true },
      );
    }
    form.clearErrors("base_unit_id");
    setBlockedRemovalErrors({});
  }

  function removeUnit(unitId: number) {
    if (selectedUnitIds.length <= 1) return;
    const targetName = unitsById.get(unitId)?.name ?? copy.units.unitPending;
    if (unitId === Number(baseUnitId)) {
      setBlockedRemovalErrors({
        [unitId]: copy.units.chooseNewBaseBeforeRemove(targetName),
      });
      return;
    }
    const anchorUnitIds = Object.fromEntries(
      Object.entries(unitAnchorIds).map(([id, anchorId]) => [
        Number(id),
        anchorId ? Number(anchorId) : null,
      ]),
    );
    const dependents = findDirectDependents(anchorUnitIds, unitId).filter(
      (id) => selectedUnitIds.includes(id),
    );
    if (dependents.length > 0) {
      const dependentNames = dependents.map(
        (dependentId) =>
          unitsById.get(dependentId)?.name ?? copy.units.unitPending,
      );
      setBlockedRemovalErrors({
        [unitId]: copy.units.removeBlocked(
          targetName,
          dependentNames.join(", "),
        ),
      });
      for (const dependentId of dependents) {
        form.setError(`unit_anchor_ids.${dependentId}`, {
          type: "manual",
          message: copy.units.reassignBeforeRemove(
            unitsById.get(dependentId)?.name ?? copy.units.unitPending,
            unitsById.get(unitId)?.name ?? copy.units.unitPending,
          ),
        });
      }
      const firstDependentId = dependents[0]!;
      requestAnimationFrame(() => {
        form.setFocus(`unit_anchor_ids.${firstDependentId}`);
      });
      return;
    }

    const nextUnitIds = unitIds.filter((id) => Number(id) !== unitId);
    form.setValue("unit_ids", nextUnitIds, {
      shouldDirty: true,
      shouldValidate: true,
    });
    const { [String(unitId)]: _removedAnchor, ...remainingAnchorIds } =
      unitAnchorIds;
    const { [String(unitId)]: _removedFactor, ...remainingFactors } =
      unitFactors;
    form.setValue("unit_anchor_ids", remainingAnchorIds, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("unit_factors", remainingFactors, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setBlockedRemovalErrors({});
  }

  async function changeBase(nextBaseId: string): Promise<void> {
    if (!relations || !baseUnitId || nextBaseId === baseUnitId) return;
    try {
      const rebased = rebaseUnitRelations({
        unitIds: selectedUnitIds,
        oldBaseUnitId: Number(baseUnitId),
        newBaseUnitId: Number(nextBaseId),
        anchorUnitIds: relations.anchorUnitIds,
        anchorFactors: relations.anchorFactors,
        unitOptions,
      });
      const anchorUnitIds = Object.fromEntries(
        Object.entries(rebased.anchorUnitIds).map(([unitId, anchorUnitId]) => [
          unitId,
          anchorUnitId == null ? "" : String(anchorUnitId),
        ]),
      );
      const anchorFactors = Object.fromEntries(
        Object.entries(rebased.anchorFactors).map(([unitId, factor]) => [
          unitId,
          factor == null ? "" : String(factor),
        ]),
      );
      form.setValue("base_unit_id", nextBaseId, {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.setValue("unit_anchor_ids", anchorUnitIds, {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.setValue("unit_factors", anchorFactors, {
        shouldDirty: true,
        shouldValidate: false,
      });
      form.clearErrors(["base_unit_id", "unit_anchor_ids", "unit_factors"]);
      setBlockedRemovalErrors({});
      await form.trigger(["base_unit_id", "unit_anchor_ids", "unit_factors"]);
    } catch (error) {
      const message =
        error instanceof IngredientUnitModelError &&
        error.message === "standard_unit_dimension_mismatch"
          ? copy.units.dimensionMismatch
          : error instanceof IngredientUnitModelError &&
              error.message === "anchor_factor_out_of_range"
            ? copy.units.factorPrecision
            : error instanceof IngredientUnitModelError &&
                error.message === "effective_factor_out_of_range"
              ? copy.units.effectiveFactorPrecision
              : copy.units.invalidBaseFactor;
      form.setError("base_unit_id", {
        type: "manual",
        message,
      });
      form.setFocus("base_unit_id");
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
        {selectedUnitIds.length > 0 && baseUnit && relations ? (
          <Field data-invalid={Boolean(baseFieldState.error)}>
            <FieldLabel htmlFor="base-unit-select">
              {copy.units.baseUnit}
            </FieldLabel>
            <Select
              value={String(baseField.value ?? "")}
              onValueChange={(value) => void changeBase(value)}
            >
              <SelectTrigger
                id="base-unit-select"
                size={controlSize}
                className="w-full"
                aria-invalid={Boolean(baseFieldState.error)}
                aria-describedby={
                  baseFieldState.error ? baseErrorId : undefined
                }
                onBlur={baseField.onBlur}
                ref={baseField.ref}
              >
                <SelectValue placeholder={copy.units.selectBase} />
              </SelectTrigger>
              <SelectContent>
                {selectedUnitIds.flatMap((unitId) => {
                  const unit = unitsById.get(unitId);
                  return unit == null
                    ? []
                    : [
                        <SelectItem
                          key={unitId}
                          value={String(unitId)}
                          size={controlSize === "touch" ? "touch" : "default"}
                        >
                          {unit.name}
                        </SelectItem>,
                      ];
                })}
              </SelectContent>
            </Select>
            {baseFieldState.error ? (
              <FieldError id={baseErrorId} errors={[baseFieldState.error]} />
            ) : null}
          </Field>
        ) : null}
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
        <FieldLegend>{copy.units.sectionLabel}</FieldLegend>
        {selectedUnitIds.length > 0 && baseUnit && relations ? (
          <ItemGroup className="gap-2" role="list">
            {selectedUnitIds
              .filter((unitId) => unitId !== baseUnit.id)
              .map((unitId) => {
                const unit = unitsById.get(unitId);
                if (!unit) return null;
                const effectiveFactor = (() => {
                  try {
                    return deriveEffectiveUnitFactor(relations, unitId);
                  } catch {
                    return null;
                  }
                })();
                const anchorUnitId = relations.anchorUnitIds[unitId] ?? null;
                const anchorOptions = selectedUnitIds
                  .filter(
                    (candidateId) =>
                      candidateId !== unitId &&
                      !wouldCreateUnitCycle(
                        relations.anchorUnitIds,
                        unitId,
                        candidateId,
                      ),
                  )
                  .flatMap((candidateId) => {
                    const candidate = unitsById.get(candidateId);
                    return candidate == null
                      ? []
                      : [{ value: String(candidateId), label: candidate.name }];
                  });

                return (
                  <UnitRelationRow
                    key={unitId}
                    control={form.control}
                    unit={unit}
                    anchorOptions={anchorOptions}
                    effectiveFactor={effectiveFactor}
                    automatic={isAutomaticStandardRelation(
                      unit,
                      baseUnit,
                      anchorUnitId,
                      relations.anchorFactors[unitId] ?? null,
                    )}
                    removalError={blockedRemovalErrors[unitId]}
                    removeDisabled={selectedUnitIds.length === 1}
                    onRemove={() => removeUnit(unitId)}
                  />
                );
              })}
          </ItemGroup>
        ) : null}
        {availableUnitOptions.length > 0 && unitIds.length < 20 ? (
          <div className="w-full">
            <Select value="" onValueChange={addUnit}>
              <SelectTrigger
                size={controlSize}
                className="w-full"
                aria-label={copy.units.add}
              >
                <SelectValue placeholder={copy.units.add} />
              </SelectTrigger>
              <SelectContent>
                {availableUnitOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    size={controlSize === "touch" ? "touch" : "default"}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </FieldSet>
    </>
  );
}

function UnitRelationRow({
  control,
  unit,
  anchorOptions,
  effectiveFactor,
  automatic,
  removalError,
  removeDisabled,
  onRemove,
}: {
  control: Control<IngredientFormValues>;
  unit: UnitOption;
  anchorOptions: Array<{ value: string; label: string }>;
  effectiveFactor: number | null;
  automatic: boolean;
  removalError: string | undefined;
  removeDisabled: boolean;
  onRemove: () => void;
}) {
  const factorName =
    `unit_factors.${unit.id}` as FieldPath<IngredientFormValues>;
  const factor = useController({ control, name: factorName });
  const anchor = useController({
    control,
    name: ("unit_anchor_ids." + unit.id) as FieldPath<IngredientFormValues>,
  });
  const controlSize = useFormControlSize("responsive");
  const factorFieldId = `field-unit-factor-${unit.id}`;
  const anchorFieldId = `field-unit-anchor-${unit.id}`;
  const factorErrorId = factor.fieldState.error
    ? `${factorFieldId}-error`
    : undefined;
  const anchorErrorId = anchor.fieldState.error
    ? `${anchorFieldId}-error`
    : undefined;
  const removalErrorId = removalError
    ? `field-unit-remove-${unit.id}-error`
    : undefined;
  return (
    <Field
      data-invalid={Boolean(
        factor.fieldState.error || anchor.fieldState.error || removalError,
      )}
    >
      <Item
        variant="outline"
        size="sm"
        role="listitem"
        className="block min-w-0"
        aria-describedby={removalErrorId}
      >
        <div className="grid w-full min-w-0 items-center gap-2 sm:grid-cols-[minmax(5rem,1fr)_auto_7rem_minmax(9rem,1.25fr)_auto]">
          <div className="truncate font-heading text-sm font-semibold" title={unit.name}>
            {unit.name}
          </div>
          <span className="whitespace-nowrap text-sm tabular-nums">
            1 {unit.name} =
          </span>
          {automatic ? (
            <output className="w-28 text-center text-sm tabular-nums">
              {effectiveFactor == null
                ? copy.units.unitPending
                : formatDecimal(effectiveFactor, 9)}
            </output>
          ) : (
            <FormattedNumberInput
              id={factorFieldId}
              name={factorName}
              className="w-28"
              value={String(factor.field.value ?? "")}
              onValueChange={factor.field.onChange}
              onBlur={factor.field.onBlur}
              ref={factor.field.ref}
              controlSize={controlSize}
              maxFractionDigits={9}
              aria-invalid={Boolean(factor.fieldState.error)}
              aria-describedby={factorErrorId}
              aria-label={copy.units.factorAria(unit.name)}
            />
          )}
          <Select
            value={String(anchor.field.value ?? "")}
            onValueChange={(value) => {
              anchor.field.onChange(value);
              anchor.field.onBlur();
            }}
          >
            <SelectTrigger
              id={anchorFieldId}
              size={controlSize}
              className="w-full min-w-36"
              aria-invalid={Boolean(anchor.fieldState.error)}
              aria-describedby={anchorErrorId}
              aria-label={copy.units.anchorAria(unit.name)}
              onBlur={anchor.field.onBlur}
              ref={anchor.field.ref}
            >
              <SelectValue placeholder={copy.units.anchorPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {anchorOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  size={controlSize === "touch" ? "touch" : "default"}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ItemActions className="justify-end">
            <Button
              type="button"
              variant="ghost"
              size={controlSize === "touch" ? "icon-touch" : "icon-sm"}
              onClick={onRemove}
              disabled={removeDisabled}
              aria-label={`${copy.units.remove} ${unit.name}`}
            >
              <IconTrash aria-hidden="true" />
            </Button>
          </ItemActions>
        </div>
      </Item>
      {factor.fieldState.error ? (
        <FieldError id={factorErrorId} errors={[factor.fieldState.error]} />
      ) : null}
      {anchor.fieldState.error ? (
        <FieldError id={anchorErrorId} errors={[anchor.fieldState.error]} />
      ) : null}
      {removalError ? (
        <FieldError id={removalErrorId} errors={[{ message: removalError }]} />
      ) : null}
    </Field>
  );
}
