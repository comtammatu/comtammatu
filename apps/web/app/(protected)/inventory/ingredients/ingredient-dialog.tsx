"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight as IconArrowLeftRight,
  ChevronDown as IconChevronDown,
  Plus as IconPlus,
  Trash2 as IconTrash,
} from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemActions,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  AppDialog,
  FormDialog,
  FormSheet,
  FormattedNumberInput,
  QuantityField,
  SelectField,
  TextField,
} from "@/components/form";
import { AppSheet } from "@/components/surface/app-sheet";
import { useFormControlSize } from "@/components/form/control-size";
import {
  createIngredient,
  fetchIngredientDetail,
  updateIngredient,
} from "../ingredient-actions";
import { createUnit } from "../settings/units/units-actions";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@lib/inventory/types";
import { parseOptionalNumber, formatVND } from "@lib/inventory/format";
import { getDisplayReferenceCost } from "@lib/inventory/reference-cost";
import { resolveFulfillSiteFlags } from "@lib/inventory/fulfill-site";
import { formatDecimal } from "@comtammatu/shared/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { cn } from "@comtammatu/ui";
import {
  buildCatalogUnits,
  deriveEffectiveUnitFactor,
  findDirectDependents,
  IngredientUnitModelError,
  inverseFactorToStored,
  isValidAnchorFactor,
  readCatalogUnitModel,
  rebaseUnitRelations,
  resolveFactorDisplay,
  wouldCreateUnitCycle,
} from "./ingredient-unit-form-model";
import type {
  IngredientUnitModelErrorCode,
  UnitRelationInput,
} from "./ingredient-unit-form-model";

const copy = messages.inventoryMaster.ingredientForm;
const dialogCopy = messages.inventory.ingredients.dialog;
const NO_CATEGORY = "none";

type UnitSelectOption = { value: string; label: string };
type UnitSelectOptionGroup = {
  label: string;
  options: UnitSelectOption[];
};

function groupUnitSelectOptions(
  unitOptions: readonly UnitOption[],
  include?: ReadonlySet<number>,
): UnitSelectOptionGroup[] {
  const mass: UnitSelectOption[] = [];
  const volume: UnitSelectOption[] = [];
  const packaging: UnitSelectOption[] = [];

  for (const unit of unitOptions) {
    if (include != null && !include.has(unit.id)) continue;
    const option = { value: String(unit.id), label: unit.name };
    if (unit.is_standard && unit.dimension === "mass") mass.push(option);
    else if (unit.is_standard && unit.dimension === "volume") volume.push(option);
    else packaging.push(option);
  }

  return [
    { label: copy.units.groupMass, options: mass },
    { label: copy.units.groupVolume, options: volume },
    { label: copy.units.groupPackaging, options: packaging },
  ].filter((group) => group.options.length > 0);
}

function UnitSelectOptionGroups({
  groups,
  controlSize,
}: {
  groups: readonly UnitSelectOptionGroup[];
  controlSize: "field" | "touch";
}) {
  const itemSize = controlSize === "touch" ? "touch" : "default";
  return (
    <>
      {groups.map((group) => (
        <SelectGroup key={group.label}>
          <SelectLabel>{group.label}</SelectLabel>
          {group.options.map((option) => (
            <SelectItem key={option.value} value={option.value} size={itemSize}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}

const ingredientSchemaBase = z.object({
  name: z.string().trim().min(1, { error: dialogCopy.nameRequired }),
  sku: z.string().trim().optional(),
  category_id: z.string().trim().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]),
  min_stock_level: z.string().optional(),
  fulfill_from_central_supply: z.boolean(),
  fulfill_from_central_kitchen: z.boolean(),
  unit_ids: z
    .array(z.string().trim().min(1))
    .min(1, { error: copy.units.selectUnit })
    .max(20, { error: copy.units.maxReached }),
  base_unit_id: z.string().trim().min(1, { error: copy.units.selectBase }),
  unit_anchor_ids: z.record(z.string(), z.string()),
  unit_factors: z.record(z.string(), z.string()),
  unit_factor_modes: z.record(z.string(), z.enum(["direct", "inverse"])),
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
      Object.entries(values.unit_factors).map(([id, factor]) => {
        const mode = values.unit_factor_modes[id] ?? "direct";
        if (!factor) return [Number(id), null];
        if (mode === "inverse") {
          const stored = inverseFactorToStored(factor);
          return [Number(id), stored == null ? factor : stored];
        }
        return [Number(id), factor];
      }),
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
    // Inverse rows whose count has no exact reciprocal cannot be stored;
    // point the editor at the row with a swap-direction message.
    for (const [unitId, factor] of Object.entries(data.unit_factors)) {
      if (!factor || data.unit_factor_modes[unitId] !== "inverse") continue;
      if (inverseFactorToStored(factor) == null) {
        ctx.addIssue({
          code: "custom",
          path: ["unit_factors", unitId],
          message: copy.units.inverseNotExact,
        });
      }
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
  const flags = resolveFulfillSiteFlags({
    fulfillFromCentralSupply: ingredient?.fulfill_from_central_supply,
    fulfillFromCentralKitchen: ingredient?.fulfill_from_central_kitchen,
    defaultFulfillSiteKind: ingredient?.default_fulfill_site_kind,
  });

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
    fulfill_from_central_supply: flags.fulfillFromCentralSupply,
    fulfill_from_central_kitchen: flags.fulfillFromCentralKitchen,
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
        resolveFactorDisplay(factor).value,
      ]),
    ),
    unit_factor_modes: Object.fromEntries(
      Object.entries(unitModel.anchorFactors).map(([unitId, factor]) => [
        unitId,
        resolveFactorDisplay(factor).mode,
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
  /** When set, focus this field after the dialog opens (edit readiness flow). */
  focusField?: "default_fulfill_site_kind";
  onSaved: (detail: IngredientSavedDetail) => void | Promise<void>;
  chrome?: "dialog" | "sheet";
}

function IngredientStatusOverlay({
  chrome,
  open,
  onOpenChange,
  title,
  children,
}: {
  chrome: "dialog" | "sheet";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const footer = (
    <Button
      type="button"
      variant="outline"
      size={chrome === "sheet" ? "touch" : "default"}
      onClick={() => onOpenChange(false)}
    >
      {ACTIONS_VI.cancel}
    </Button>
  );
  if (chrome === "sheet") {
    return (
      <AppSheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        side="bottom"
        footer={footer}
      >
        {children}
      </AppSheet>
    );
  }
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      contentClassName="sm:max-w-2xl"
      footer={footer}
    >
      {children}
    </AppDialog>
  );
}

export type IngredientSavedDetail = {
  mode: "create" | "edit";
  id: number;
  row: IngredientRow;
};

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  unitOptions,
  categoryOptions,
  focusField,
  onSaved,
  chrome = "dialog",
}: IngredientDialogProps) {
  const isEdit = ingredient !== null;
  const [resolvedIngredient, setResolvedIngredient] =
    useState<IngredientRow | null>(ingredient);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsLoadError, setUnitsLoadError] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [createdUnits, setCreatedUnits] = useState<UnitOption[]>([]);

  useEffect(() => {
    if (!open) {
      setResolvedIngredient(ingredient);
      setUnitsLoading(false);
      setUnitsLoadError(null);
      setWizardStep(0);
      setCreatedUnits([]);
      return;
    }

    setResolvedIngredient(ingredient);
    setUnitsLoadError(null);

    if (!ingredient) {
      setUnitsLoading(false);
      return;
    }

    if ((ingredient.units?.length ?? 0) > 0) {
      setUnitsLoading(false);
      return;
    }

    let cancelled = false;
    setUnitsLoading(true);
    void fetchIngredientDetail(ingredient.id).then((result) => {
      if (cancelled) return;
      setUnitsLoading(false);
      if (!result.success || !result.data) {
        setUnitsLoadError(copy.units.unitsLoadFailed);
        toast.error(result.error ?? copy.units.unitsLoadFailed);
        return;
      }
      setResolvedIngredient(result.data);
    });

    return () => {
      cancelled = true;
    };
  }, [open, ingredient]);

  const mergedUnitOptions = useMemo(
    () =>
      createdUnits.length === 0
        ? unitOptions
        : [...unitOptions, ...createdUnits],
    [unitOptions, createdUnits],
  );

  const handleCreateUnit = useCallback(
    async (code: string): Promise<number | null> => {
      const result = await createUnit({ code, is_active: true });
      if (!result.success || result.data == null) {
        toast.error(result.error ?? copy.units.createInlineFailed);
        return null;
      }
      const trimmed = code.trim().toLowerCase();
      const option: UnitOption = {
        id: Number(result.data.id),
        code: trimmed,
        name: trimmed,
        dimension: null,
        is_standard: false,
        standard_factor: null,
      };
      setCreatedUnits((previous) => [...previous, option]);
      toast.success(copy.units.createInlineSuccess(trimmed));
      return option.id;
    },
    [],
  );

  const defaultValues = useMemo(
    () => toFormValues(resolvedIngredient, mergedUnitOptions),
    [resolvedIngredient, mergedUnitOptions],
  );
  const ingredientSchema = useMemo(
    () => createIngredientSchema(mergedUnitOptions),
    [mergedUnitOptions],
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

  async function handleSubmit(values: IngredientFormValues) {
    try {
      const relations = toUnitRelations(values, mergedUnitOptions);
      const units = buildCatalogUnits(relations);
      const categoryId =
        values.category_id && values.category_id !== NO_CATEGORY
          ? Number(values.category_id)
          : null;
      const storageType: "ambient" | "refrigerated" | "frozen" =
        resolvedIngredient?.storage_type === "refrigerated" ||
        resolvedIngredient?.storage_type === "frozen"
          ? resolvedIngredient.storage_type
          : "ambient";
      const fulfillFlags = {
        fulfill_from_central_supply: values.fulfill_from_central_supply,
        fulfill_from_central_kitchen: values.fulfill_from_central_kitchen,
      };
      const payload = {
        name: values.name,
        sku: values.sku || undefined,
        category_id: categoryId,
        item_kind: values.item_kind,
        storage_type: storageType,
        min_stock_level: parseOptionalNumber(values.min_stock_level) ?? 0,
        default_fulfill_site_kind: values.fulfill_from_central_supply
          ? ("central_supply" as const)
          : values.fulfill_from_central_kitchen
            ? ("central_kitchen" as const)
            : null,
        ...fulfillFlags,
        units,
      };
      const result =
        isEdit && resolvedIngredient
          ? await updateIngredient(resolvedIngredient.id, payload)
          : await createIngredient(payload);

      if (!result.success) return result;

      const savedId =
        isEdit && resolvedIngredient
          ? resolvedIngredient.id
          : Number(
              (result.data as { id?: number } | undefined)?.id ?? NaN,
            );
      if (!Number.isInteger(savedId) || savedId <= 0) {
        return { success: false, error: dialogCopy.saveFailed };
      }

      const baseUnit = units.find((unit) => unit.is_base);
      const categoryName =
        categoryOptions.find((category) => category.id === categoryId)?.name ??
        null;
      const row: IngredientRow = {
        id: savedId,
        name: values.name.trim(),
        sku: values.sku?.trim() ? values.sku.trim() : null,
        category: categoryName,
        category_id: categoryId,
        category_name: categoryName,
        item_kind: values.item_kind,
        monetary: resolvedIngredient?.monetary ?? null,
        min_stock_level: payload.min_stock_level,
        max_stock_level: resolvedIngredient?.max_stock_level ?? null,
        reorder_point: resolvedIngredient?.reorder_point ?? null,
        storage_type: storageType,
        default_fulfill_site_kind: payload.default_fulfill_site_kind,
        fulfill_from_central_supply: values.fulfill_from_central_supply,
        fulfill_from_central_kitchen: values.fulfill_from_central_kitchen,
        has_active_supplier_link:
          resolvedIngredient?.has_active_supplier_link === true,
        unit: baseUnit
          ? mergedUnitOptions.find((option) => option.id === baseUnit.unit_id)
              ?.name ?? ""
          : "",
        is_active: resolvedIngredient?.is_active ?? true,
        updated_at: resolvedIngredient?.updated_at ?? null,
        units: units.map((unit, index) => {
          const option = mergedUnitOptions.find(
            (item) => item.id === unit.unit_id,
          );
          return {
            id:
              resolvedIngredient?.units?.find(
                (rowUnit) => rowUnit.unit_id === unit.unit_id,
              )?.id ?? index + 1,
            unit_id: unit.unit_id,
            unit_code: option?.code ?? "",
            unit_name: option?.name ?? option?.code ?? "",
            to_base_factor: unit.to_base_factor,
            is_base: unit.is_base,
            anchor_unit_id: unit.anchor_unit_id ?? null,
            anchor_factor: unit.anchor_factor ?? null,
            is_active: true,
            sort_order: index,
          };
        }),
      };

      try {
        await onSaved({
          mode: isEdit ? "edit" : "create",
          id: savedId,
          row,
        });
      } catch {
        toast.error(dialogCopy.reloadAfterSaveFailed);
      }
      return result;
    } catch (error) {
      if (error instanceof IngredientUnitModelError) {
        return {
          success: false,
          error: unitRelationIssue(
            error,
            toUnitRelations(values, mergedUnitOptions),
          ).message,
        };
      }
      return { success: false, error: dialogCopy.saveFailed };
    }
  }

  if (open && isEdit && unitsLoading) {
    return (
      <IngredientStatusOverlay
        chrome={chrome}
        open={open}
        onOpenChange={onOpenChange}
        title={dialogCopy.editTitle}
      >
        <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {copy.units.unitsLoading}
        </div>
      </IngredientStatusOverlay>
    );
  }

  if (open && isEdit && unitsLoadError) {
    return (
      <IngredientStatusOverlay
        chrome={chrome}
        open={open}
        onOpenChange={onOpenChange}
        title={dialogCopy.editTitle}
      >
        <p className="text-sm text-destructive" role="alert">
          {unitsLoadError}
        </p>
      </IngredientStatusOverlay>
    );
  }

  const FormChrome = chrome === "sheet" ? FormSheet : FormDialog;

  return (
    <FormChrome
      open={open}
      onOpenChange={onOpenChange}
      schema={ingredientSchema}
      defaultValues={defaultValues}
      entityKey={`${resolvedIngredient?.id ?? "new-ingredient"}:${focusField ?? "default"}:u${resolvedIngredient?.units?.length ?? 0}`}
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
          unitOptions={mergedUnitOptions}
          focusField={focusField}
          defaultUnitsOpen={!isEdit || (resolvedIngredient?.units?.length ?? 0) > 1}
          referenceIngredient={resolvedIngredient}
          wizardStep={wizardStep}
          onWizardStepChange={setWizardStep}
          onCreateUnit={handleCreateUnit}
        />
      )}
    </FormChrome>
  );
}

function IngredientDialogFields({
  form,
  categorySelectOptions,
  unitOptions,
  focusField,
  defaultUnitsOpen,
  referenceIngredient,
  wizardStep,
  onWizardStepChange,
  onCreateUnit,
}: {
  form: UseFormReturn<IngredientFormValues>;
  categorySelectOptions: Array<{ value: string; label: string }>;
  unitOptions: UnitOption[];
  focusField?: "default_fulfill_site_kind";
  defaultUnitsOpen: boolean;
  referenceIngredient: IngredientRow | null;
  wizardStep: number;
  onWizardStepChange: (step: number) => void;
  onCreateUnit: (code: string) => Promise<number | null>;
}) {
  const itemKind = form.watch("item_kind");
  const unitIds = form.watch("unit_ids");
  const baseUnitId = form.watch("base_unit_id");
  const unitAnchorIds = form.watch("unit_anchor_ids");
  const unitFactors = form.watch("unit_factors");
  const unitFactorModes = form.watch("unit_factor_modes");
  const [blockedRemovalErrors, setBlockedRemovalErrors] = useState<
    Record<number, string>
  >({});
  const [unitsOpen, setUnitsOpen] = useState(defaultUnitsOpen);
  const controlSize = useFormControlSize("responsive");

  useEffect(() => {
    setUnitsOpen(defaultUnitsOpen);
  }, [defaultUnitsOpen]);

  useEffect(() => {
    if (!focusField) return;
    onWizardStepChange(0);
    const frame = window.requestAnimationFrame(() => {
      if (focusField === "default_fulfill_site_kind") {
        document.getElementById("fulfill-from-central-supply")?.focus();
        return;
      }
      form.setFocus(focusField);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusField, form, onWizardStepChange]);
  const { field: baseField, fieldState: baseFieldState } = useController({
    control: form.control,
    name: "base_unit_id",
  });
  const baseErrorId = "base-unit-error";
  const selectedUnitIds = [...new Set(unitIds.map(Number))];
  const unitsById = new Map(unitOptions.map((unit) => [unit.id, unit]));
  const baseUnit = unitsById.get(Number(baseUnitId));
  const availableUnitGroups = groupUnitSelectOptions(
    unitOptions,
    new Set(
      unitOptions
        .filter((unit) => !unitIds.includes(String(unit.id)))
        .map((unit) => unit.id),
    ),
  );
  const allUnitGroups = groupUnitSelectOptions(unitOptions);
  const referenceCost = referenceIngredient
    ? getDisplayReferenceCost(referenceIngredient)
    : null;

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
          if (unitId === baseUnit.id) return [unitId, null];
          const factor = unitFactors[String(unitId)];
          if (!factor) return [unitId, null];
          if (unitFactorModes[String(unitId)] === "inverse") {
            const stored = inverseFactorToStored(factor);
            return [unitId, stored == null ? factor : stored];
          }
          return [unitId, factor];
        }),
      ),
      unitOptions,
    };
  }, [
    baseUnit,
    selectedUnitIds,
    unitAnchorIds,
    unitFactors,
    unitFactorModes,
    unitOptions,
  ]);

  function addUnit(nextValue: string) {
    if (!nextValue || unitIds.includes(nextValue) || unitIds.length >= 20)
      return;
    setUnitsOpen(true);
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
      form.setValue(
        "unit_factor_modes",
        { ...unitFactorModes, [nextValue]: "direct" },
        { shouldDirty: true },
      );
    } else {
      // ADR 0045: new conversions default to the standard unit; the
      // anchor chain stays reachable through the per-row advanced mode.
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
      form.setValue(
        "unit_factor_modes",
        { ...unitFactorModes, [nextValue]: "direct" },
        { shouldDirty: true },
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
    const { [String(unitId)]: _removedMode, ...remainingModes } =
      unitFactorModes;
    form.setValue("unit_anchor_ids", remainingAnchorIds, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("unit_factors", remainingFactors, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("unit_factor_modes", remainingModes, {
      shouldDirty: true,
    });
    setBlockedRemovalErrors({});
  }

  function toggleFactorDirection(unitId: number) {
    const key = String(unitId);
    const raw = String(unitFactors[key] ?? "").trim();
    const currentMode = unitFactorModes[key] ?? "direct";
    const nextMode = currentMode === "inverse" ? "direct" : "inverse";
    const numeric = Number(raw);
    if (raw && Number.isFinite(numeric) && numeric > 0) {
      const reciprocal = 1 / numeric;
      if (!isValidAnchorFactor(reciprocal)) {
        form.setError(`unit_factors.${unitId}`, {
          type: "manual",
          message: copy.units.inverseNotExact,
        });
        return;
      }
      form.setValue(
        "unit_factors",
        { ...unitFactors, [key]: String(reciprocal) },
        { shouldDirty: true, shouldValidate: true },
      );
    }
    form.setValue(
      "unit_factor_modes",
      { ...unitFactorModes, [key]: nextMode },
      { shouldDirty: true },
    );
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
          resolveFactorDisplay(factor).value,
        ]),
      );
      const anchorFactorModes = Object.fromEntries(
        Object.entries(rebased.anchorFactors).map(([unitId, factor]) => [
          unitId,
          resolveFactorDisplay(factor).mode,
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
      form.setValue("unit_factor_modes", anchorFactorModes, {
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

  const formErrors = form.formState.errors;
  const wizardSteps = [
    copy.wizard.stepInfo,
    copy.wizard.stepBase,
    copy.wizard.stepUnits,
  ];
  const wizardInvalid = [
    Boolean(formErrors.name),
    Boolean(baseFieldState.error),
    Boolean(
      formErrors.unit_ids || formErrors.unit_anchor_ids || formErrors.unit_factors,
    ),
  ];

  return (
    <>
      <WizardStepHeader
        steps={wizardSteps}
        current={wizardStep}
        invalid={wizardInvalid}
        onSelect={onWizardStepChange}
      />
      <div hidden={wizardStep !== 0}>
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
        <div className="sm:col-span-2 flex flex-col gap-2">
          <span className="text-sm font-medium">
            {dialogCopy.defaultFulfillSiteKindLabel}
          </span>
          <FieldDescription>
            {dialogCopy.defaultFulfillSiteKindHint}
          </FieldDescription>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="fulfill-from-central-supply">
              {dialogCopy.defaultFulfillSiteKindCentralSupply}
            </FieldLabel>
            <Switch
              id="fulfill-from-central-supply"
              checked={form.watch("fulfill_from_central_supply")}
              onCheckedChange={(checked) =>
                form.setValue("fulfill_from_central_supply", checked, {
                  shouldDirty: true,
                })
              }
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="fulfill-from-central-kitchen">
              {dialogCopy.defaultFulfillSiteKindCentralKitchen}
            </FieldLabel>
            <Switch
              id="fulfill-from-central-kitchen"
              checked={form.watch("fulfill_from_central_kitchen")}
              onCheckedChange={(checked) =>
                form.setValue("fulfill_from_central_kitchen", checked, {
                  shouldDirty: true,
                })
              }
            />
          </Field>
        </div>
        {referenceIngredient?.monetary != null ? (
          <Field>
            <FieldLabel>{dialogCopy.referenceCostLabel}</FieldLabel>
            <output className="text-sm font-mono tabular-nums">
              {referenceCost
                ? `${formatVND(referenceCost.value)}${
                    referenceCost.unit ? `/${referenceCost.unit}` : ""
                  }`
                : dialogCopy.referenceCostEmpty}
            </output>
            <FieldDescription>{dialogCopy.referenceCostHint}</FieldDescription>
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <Field orientation="horizontal">
            <FieldLabel htmlFor="item-kind-finished-good">
              {dialogCopy.finishedGoodLabel}
            </FieldLabel>
            <Switch
              id="item-kind-finished-good"
              checked={itemKind === "finished_good"}
              onCheckedChange={(checked) => {
                form.setValue(
                  "item_kind",
                  checked ? "finished_good" : "raw_material",
                );
                if (checked && !form.getValues("fulfill_from_central_kitchen")) {
                  form.setValue("fulfill_from_central_kitchen", true, {
                    shouldDirty: true,
                  });
                }
              }}
            />
          </Field>
          <FieldDescription>{dialogCopy.finishedGoodHint}</FieldDescription>
        </div>
      </div>
      </div>

      <div hidden={wizardStep !== 1} className="flex flex-col gap-2">
        {selectedUnitIds.length === 0 ? (
          <Field>
            <FieldLabel htmlFor="base-unit-select">
              {copy.units.baseUnit}
            </FieldLabel>
            <Select value="" onValueChange={addUnit}>
              <SelectTrigger
                id="base-unit-select"
                size={controlSize}
                className="w-full"
                aria-label={copy.units.baseUnit}
              >
                <SelectValue placeholder={copy.units.selectBase} />
              </SelectTrigger>
              <SelectContent>
                <UnitSelectOptionGroups
                  groups={allUnitGroups}
                  controlSize={controlSize}
                />
              </SelectContent>
            </Select>
            <FieldDescription>{copy.units.baseUnitDescription}</FieldDescription>
          </Field>
        ) : selectedUnitIds.length > 0 && baseUnit && relations ? (
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
            <FieldDescription>{copy.units.baseUnitDescription}</FieldDescription>
            {baseFieldState.error ? (
              <FieldError id={baseErrorId} errors={[baseFieldState.error]} />
            ) : null}
          </Field>
        ) : null}
        {referenceIngredient?.monetary != null ? (
          <FieldDescription role="note">
            {copy.units.baseChangeRescaleWarning}
          </FieldDescription>
        ) : null}
      </div>

      <div hidden={wizardStep !== 2}>
      <Collapsible open={unitsOpen || wizardStep === 2} onOpenChange={setUnitsOpen}>
        <FieldSet data-invalid={Boolean(baseFieldState.error)}>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size={controlSize}
                className="group -mx-2 h-auto w-[calc(100%+1rem)] justify-between px-2 py-2 font-normal"
              />
            }
          >
            <span className="flex min-w-0 flex-col items-start gap-1 text-left">
              <span className="text-sm font-medium">
                {copy.units.sectionToggle}
              </span>
              <span className="text-xs text-muted-foreground">
                {copy.units.sectionToggleHint}
              </span>
            </span>
            <IconChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                unitsOpen && "rotate-180",
              )}
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-3 pt-2">
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
                          : [
                              {
                                value: String(candidateId),
                                label: candidate.name,
                              },
                            ];
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
                        baseUnitId={baseUnit.id}
                        baseUnitName={baseUnit.name}
                        anchorLabel={
                          unitsById.get(anchorUnitId ?? Number.NaN)?.name ??
                          baseUnit.name
                        }
                        initialAdvanced={
                          anchorUnitId != null && anchorUnitId !== baseUnit.id
                        }
                        removalError={blockedRemovalErrors[unitId]}
                        removeDisabled={selectedUnitIds.length === 1}
                        onRemove={() => removeUnit(unitId)}
                        onToggleDirection={() => toggleFactorDirection(unitId)}
                      />
                    );
                  })}
              </ItemGroup>
            ) : null}
            {availableUnitGroups.length > 0 && unitIds.length < 20 ? (
              <div className="flex w-full flex-col gap-2">
                <Select value="" onValueChange={addUnit}>
                  <SelectTrigger
                    size={controlSize}
                    className="w-full"
                    aria-label={copy.units.add}
                  >
                    <SelectValue placeholder={copy.units.add} />
                  </SelectTrigger>
                  <SelectContent>
                    <UnitSelectOptionGroups
                      groups={availableUnitGroups}
                      controlSize={controlSize}
                    />
                  </SelectContent>
                </Select>
                <InlineUnitCreator
                  controlSize={controlSize}
                  onCreateUnit={onCreateUnit}
                  onCreated={(unitId) => addUnit(String(unitId))}
                />
              </div>
            ) : (
              <InlineUnitCreator
                controlSize={controlSize}
                onCreateUnit={onCreateUnit}
                onCreated={(unitId) => addUnit(String(unitId))}
              />
            )}
          </CollapsibleContent>
        </FieldSet>
      </Collapsible>
      </div>
    </>
  );
}

function WizardStepHeader({
  steps,
  current,
  invalid,
  onSelect,
}: {
  steps: readonly string[];
  current: number;
  invalid: readonly boolean[];
  onSelect: (index: number) => void;
}) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className="mb-4 flex flex-wrap items-center gap-1 border-b pb-2"
    >
      {steps.map((label, index) => (
        <Button
          key={label}
          type="button"
          role="tab"
          variant="ghost"
          size="sm"
          aria-selected={index === current}
          aria-label={copy.wizard.stepAria(index + 1, label)}
          onClick={() => onSelect(index)}
          className={cn(
            "gap-1.5",
            index === current
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-full border text-xs",
              invalid[index]
                ? "border-destructive text-destructive"
                : index === current
                  ? "border-foreground"
                  : "border-muted-foreground/40",
            )}
          >
            {index + 1}
          </span>
          {label}
        </Button>
      ))}
    </div>
  );
}

function InlineUnitCreator({
  controlSize,
  onCreateUnit,
  onCreated,
}: {
  controlSize: "field" | "touch";
  onCreateUnit: (code: string) => Promise<number | null>;
  onCreated: (unitId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size={controlSize}
        className="w-full justify-start"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <IconPlus aria-hidden />
        {copy.units.createInline}
      </Button>
    );
  }

  async function handleCreate() {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const unitId = await onCreateUnit(trimmed);
      if (unitId == null) {
        setError(copy.units.createInlineFailed);
        return;
      }
      setCode("");
      setOpen(false);
      onCreated(unitId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleCreate();
            }
          }}
          placeholder={copy.units.createInlinePlaceholder}
          aria-label={copy.units.createInline}
          className="w-full"
          autoFocus
        />
        <Button
          type="button"
          size={controlSize}
          disabled={busy || code.trim().length === 0}
          onClick={() => void handleCreate()}
        >
          {busy ? <Spinner className="size-4" /> : copy.units.createInlineSubmit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={controlSize}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {ACTIONS_VI.cancel}
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function UnitRelationRow({
  control,
  unit,
  anchorOptions,
  effectiveFactor,
  automatic,
  baseUnitId,
  baseUnitName,
  anchorLabel,
  initialAdvanced,
  removalError,
  removeDisabled,
  onRemove,
  onToggleDirection,
}: {
  control: Control<IngredientFormValues>;
  unit: UnitOption;
  anchorOptions: Array<{ value: string; label: string }>;
  effectiveFactor: number | null;
  automatic: boolean;
  baseUnitId: number;
  baseUnitName: string;
  anchorLabel: string;
  initialAdvanced: boolean;
  removalError: string | undefined;
  removeDisabled: boolean;
  onRemove: () => void;
  onToggleDirection: () => void;
}) {
  const [advanced, setAdvanced] = useState(initialAdvanced);
  const factorName =
    `unit_factors.${unit.id}` as FieldPath<IngredientFormValues>;
  const factor = useController({ control, name: factorName });
  const anchor = useController({
    control,
    name: ("unit_anchor_ids." + unit.id) as FieldPath<IngredientFormValues>,
  });
  const mode = useController({
    control,
    name: ("unit_factor_modes." + unit.id) as FieldPath<IngredientFormValues>,
  });
  const isInverse = mode.field.value === "inverse";
  const trailingLabel = isInverse ? unit.name : anchorLabel;
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
            1 {isInverse ? anchorLabel : unit.name} =
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
              placeholder={copy.units.factorPlaceholder}
              aria-invalid={Boolean(factor.fieldState.error)}
              aria-describedby={factorErrorId}
              aria-label={copy.units.factorAria(unit.name)}
            />
          )}
          {advanced ? (
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
          ) : (
            <span
              className="truncate text-sm text-muted-foreground"
              title={trailingLabel}
              aria-label={copy.units.simpleConversionAria(unit.name)}
            >
              {trailingLabel}
            </span>
          )}
          <ItemActions className="justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size={controlSize === "touch" ? "icon-touch" : "icon-sm"}
              aria-pressed={isInverse}
              aria-label={copy.units.toggleDirectionAria(unit.name, anchorLabel)}
              onClick={() => {
                mode.field.onBlur();
                onToggleDirection();
              }}
            >
              <IconArrowLeftRight aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size={controlSize === "touch" ? "touch" : "sm"}
              aria-pressed={advanced}
              onClick={() => {
                if (advanced) {
                  anchor.field.onChange(String(baseUnitId));
                  anchor.field.onBlur();
                }
                setAdvanced((previous) => !previous);
              }}
            >
              {copy.units.advancedConversion}
            </Button>
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
      {!automatic && effectiveFactor != null ? (
        <p className="text-xs text-muted-foreground">
          {copy.units.effectiveEquals(
            formatDecimal(effectiveFactor, 9),
            baseUnitName,
          )}
        </p>
      ) : null}
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
