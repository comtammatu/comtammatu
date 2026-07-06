"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: ingredient units table layout uses inline headers and helper labels */

import { useMemo } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import { z } from "zod";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  FormDialog,
  FormattedNumberInput,
  MoneyVndField,
  NumberField,
  QuantityField,
  SelectField,
  TextField,
} from "@/components/form";
import { createIngredient, updateIngredient } from "../ingredient-actions";
import type { CategoryOption, IngredientRow, UnitOption } from "../_lib/types";
import { STORAGE_OPTIONS, ITEM_KIND_OPTIONS } from "../_lib/constants";
import { parseOptionalNumber } from "../_lib/format";
import {
  deriveToBaseFactor,
  UnitDerivationError,
  type DerivationRow,
  type DerivationUnitInfo,
} from "../_lib/unit-derivation";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

const copy = messages.inventoryMaster.ingredientForm;
const dialogCopy = messages.inventory.ingredients.dialog;

const NO_CATEGORY = "none";
const NO_ANCHOR = "";

// Conversion factors are not money; format without a locale to keep the VND
// SSoT formatter reserved for currency. Trims trailing zeros to 6 places.
function formatFactor(value: number): string {
  return Number(value.toFixed(6)).toString();
}

const unitRowSchema = z.object({
  unit_id: z.string().trim().min(1, { error: copy.units.selectUnit }),
  to_base_factor: z
    .string()
    .trim()
    .min(1, { error: copy.units.factorPositive })
    .refine(
      (value) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0;
      },
      { error: copy.units.factorPositive },
    ),
  anchor_unit_id: z.string(),
  anchor_factor: z.string(),
  is_base: z.boolean(),
});

const ingredientSchema = z
  .object({
    name: z.string().trim().min(1, { error: dialogCopy.nameRequired }),
    sku: z.string().trim().optional(),
    category_id: z.string().trim().optional(),
    unit_cost: z.string().optional(),
    item_kind: z.enum(["raw_material", "finished_good"]),
    storage_type: z.enum(["ambient", "refrigerated", "frozen"]),
    min_stock_level: z.string().optional(),
    max_stock_level: z.string().optional(),
    reorder_point: z.string().optional(),
    shelf_life_days: z.string().optional(),
    units: z.array(unitRowSchema).min(1, { error: copy.units.minOne }),
  })
  .superRefine((data, ctx) => {
    const baseRows = data.units.filter((u) => u.is_base);
    if (baseRows.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["units"],
        message: copy.units.exactlyOneBase,
      });
    }
    const ids = data.units.map((u) => u.unit_id).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["units"],
        message: copy.units.distinctUnits,
      });
    }
  });

type IngredientFormValues = z.infer<typeof ingredientSchema>;
type UnitFormRow = z.infer<typeof unitRowSchema>;

function makeBaseRow(unitId = ""): UnitFormRow {
  return {
    unit_id: unitId,
    to_base_factor: "1",
    anchor_unit_id: NO_ANCHOR,
    anchor_factor: "",
    is_base: true,
  };
}

function makeSecondaryRow(): UnitFormRow {
  return {
    unit_id: "",
    to_base_factor: "1",
    anchor_unit_id: NO_ANCHOR,
    anchor_factor: "",
    is_base: false,
  };
}

function toFormValues(ingredient: IngredientRow | null): IngredientFormValues {
  const units = ingredient?.units?.length
    ? ingredient.units
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((u) => ({
          unit_id: String(u.unit_id),
          to_base_factor: String(u.to_base_factor),
          anchor_unit_id:
            u.anchor_unit_id != null ? String(u.anchor_unit_id) : NO_ANCHOR,
          anchor_factor: u.anchor_factor != null ? String(u.anchor_factor) : "",
          is_base: u.is_base,
        }))
    : [makeBaseRow()];

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
    storage_type:
      (ingredient?.storage_type as
        | "ambient"
        | "refrigerated"
        | "frozen"
        | undefined) ?? "ambient",
    min_stock_level:
      ingredient?.min_stock_level != null
        ? String(ingredient.min_stock_level)
        : "",
    max_stock_level:
      ingredient?.max_stock_level != null
        ? String(ingredient.max_stock_level)
        : "",
    reorder_point:
      ingredient?.reorder_point != null ? String(ingredient.reorder_point) : "",
    shelf_life_days:
      ingredient?.shelf_life_days != null
        ? String(ingredient.shelf_life_days)
        : "",
    units,
  };
}

/**
 * Builds the lookups the derivation walker needs from the live form state:
 * unit metadata by id (from the static catalog) and the anchor row for each
 * unit currently on the ingredient (from the watched form rows).
 */
function buildDerivationLookups(
  rows: UnitFormRow[],
  unitOptions: UnitOption[],
): {
  baseUnitId: number | null;
  unitsById: Map<number, DerivationUnitInfo>;
  rowsByUnitId: Map<number, DerivationRow>;
} {
  const unitsById = new Map<number, DerivationUnitInfo>();
  for (const option of unitOptions) {
    unitsById.set(option.id, {
      id: option.id,
      dimension: option.dimension,
      is_standard: option.is_standard,
      standard_factor: option.standard_factor,
    });
  }

  const rowsByUnitId = new Map<number, DerivationRow>();
  let baseUnitId: number | null = null;
  for (const row of rows) {
    const unitId = Number(row.unit_id);
    if (!Number.isInteger(unitId) || unitId <= 0) continue;
    const anchorUnitId = Number(row.anchor_unit_id);
    const anchorFactor = Number(row.anchor_factor);
    rowsByUnitId.set(unitId, {
      unit_id: unitId,
      is_base: row.is_base,
      anchor_unit_id:
        row.anchor_unit_id && Number.isInteger(anchorUnitId) && anchorUnitId > 0
          ? anchorUnitId
          : null,
      anchor_factor:
        row.anchor_factor && Number.isFinite(anchorFactor) && anchorFactor > 0
          ? anchorFactor
          : null,
    });
    if (row.is_base) baseUnitId = unitId;
  }

  return { baseUnitId, unitsById, rowsByUnitId };
}

interface IngredientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientRow | null;
  unitOptions: UnitOption[];
  categoryOptions: CategoryOption[];
  onSaved: () => void | Promise<void>;
}

function UnitsField({
  form,
  unitOptions,
  errorMessage,
}: {
  form: UseFormReturn<IngredientFormValues, unknown, IngredientFormValues>;
  unitOptions: UnitOption[];
  errorMessage?: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "units",
  });

  const watchedRows =
    useWatch({ control: form.control, name: "units" }) ?? [];

  function setBase(targetIndex: number) {
    fields.forEach((_, index) => {
      const isTarget = index === targetIndex;
      // Radio semantics: checking one base unchecks the others.
      form.setValue(`units.${index}.is_base`, isTarget, {
        shouldValidate: true,
      });
      if (isTarget) {
        // The base unit anchors nothing and is locked to factor 1.
        form.setValue(`units.${index}.to_base_factor`, "1", {
          shouldValidate: true,
        });
        form.setValue(`units.${index}.anchor_unit_id`, NO_ANCHOR, {
          shouldValidate: true,
        });
        form.setValue(`units.${index}.anchor_factor`, "", {
          shouldValidate: true,
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{copy.units.sectionLabel}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(makeSecondaryRow())}
        >
          <IconPlus className="size-4" />
          {copy.units.add}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-12 items-center gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-3">{copy.units.colUnit}</div>
          <div className="col-span-6">Hệ số quy đổi</div>
          <div className="text-center col-span-2">{copy.units.colBase}</div>
          <div className="col-span-1" />
        </div>

        <div className="divide-y">
          {fields.map((row, index) => (
            <UnitRowCells
              key={row.id}
              control={form.control}
              index={index}
              unitOptions={unitOptions}
              watchedRows={watchedRows}
              onSetBase={() => setBase(index)}
              onRemove={() => remove(index)}
              rowCount={fields.length}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{copy.units.hint}</p>
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function UnitRowCells({
  control,
  index,
  unitOptions,
  watchedRows,
  onSetBase,
  onRemove,
  rowCount,
}: {
  control: Control<IngredientFormValues>;
  index: number;
  unitOptions: UnitOption[];
  watchedRows: UnitFormRow[];
  onSetBase: () => void;
  onRemove: () => void;
  rowCount: number;
}) {
  const isBase = useWatch({ control, name: `units.${index}.is_base` }) ?? false;
  const unitId = useWatch({ control, name: `units.${index}.unit_id` }) ?? "";
  const canRemove = rowCount > 1 && !isBase;

  const selectedUnit = useMemo(
    () => unitOptions.find((u) => String(u.id) === unitId) ?? null,
    [unitOptions, unitId],
  );
  const isStandard = selectedUnit?.is_standard ?? false;
  // A row is "packaging" only once a non-standard unit is selected; an empty
  // selection shows no conversion controls until the owner picks a unit.
  const isPackaging = selectedUnit != null && !selectedUnit.is_standard;

  // Anchor targets: every OTHER unit currently on this ingredient.
  const anchorOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (const row of watchedRows) {
      if (!row.unit_id || row.unit_id === unitId) continue;
      const option = unitOptions.find((u) => String(u.id) === row.unit_id);
      if (!option) continue;
      options.push({ value: row.unit_id, label: option.name });
    }
    return options;
  }, [watchedRows, unitOptions, unitId]);

  // Live derived preview, mirroring the submit-time derivation.
  const preview = useMemo(() => {
    if (isBase || !selectedUnit) return null;
    const { baseUnitId, unitsById, rowsByUnitId } = buildDerivationLookups(
      watchedRows,
      unitOptions,
    );
    const baseUnit =
      baseUnitId != null
        ? unitOptions.find((u) => u.id === baseUnitId) ?? null
        : null;
    if (baseUnitId == null || !baseUnit) return { ok: false as const };

    const row = rowsByUnitId.get(selectedUnit.id);
    if (!row) return { ok: false as const };

    try {
      const factor = deriveToBaseFactor(
        baseUnitId,
        row,
        unitsById,
        rowsByUnitId,
      );
      return {
        ok: true as const,
        text: `${copy.units.previewPrefix(selectedUnit.code)} ${copy.units.previewValue(
          formatFactor(factor),
          baseUnit.code,
        )}`,
      };
    } catch (error) {
      if (error instanceof UnitDerivationError) return { ok: false as const };
      throw error;
    }
  }, [isBase, selectedUnit, watchedRows, unitOptions]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center px-3 py-2">
      {/* Unit Dropdown & Mobile Delete Button */}
      <div className="col-span-1 md:col-span-3 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Controller
            control={control}
            name={`units.${index}.unit_id`}
            render={({ field, fieldState }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  className={cn("h-9 w-full", fieldState.error && "border-destructive")}
                  aria-invalid={!!fieldState.error}
                  onBlur={field.onBlur}
                  ref={field.ref}
                >
                  <SelectValue placeholder={copy.units.selectUnit} />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Mobile Delete Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={copy.units.add}
          className="h-9 w-9 md:hidden flex-shrink-0"
        >
          <IconTrash className="size-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Conversion Details Column */}
      <div className="col-span-1 md:col-span-6">
        {isBase ? (
          <div className="flex items-center text-xs text-muted-foreground h-9">
            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
              {copy.units.baseTag}
            </span>
          </div>
        ) : isPackaging ? (
          <div className="flex flex-wrap items-center gap-2">
            <Controller
              control={control}
              name={`units.${index}.anchor_factor`}
              render={({ field, fieldState }) => (
                <FormattedNumberInput
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                  maxFractionDigits={6}
                  placeholder={copy.units.colFactor}
                  aria-invalid={!!fieldState.error}
                  className={cn(
                    "h-9 w-20 flex-shrink-0",
                    fieldState.error && "border-destructive",
                  )}
                />
              )}
            />
            <Controller
              control={control}
              name={`units.${index}.anchor_unit_id`}
              render={({ field, fieldState }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 w-28 flex-shrink-0",
                      fieldState.error && "border-destructive",
                    )}
                    aria-invalid={!!fieldState.error}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    aria-label={copy.units.colAnchor}
                  >
                    <SelectValue placeholder={copy.units.anchorPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {anchorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {preview?.ok ? (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {preview.text}
              </span>
            ) : (
              <span className="text-xs text-destructive whitespace-nowrap">
                {copy.units.previewInvalid}
              </span>
            )}
          </div>
        ) : isStandard ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground h-9">
            <span>{copy.units.autoStandard}</span>
            {preview?.ok && (
              <span className="whitespace-nowrap">({preview.text})</span>
            )}
          </div>
        ) : null}
      </div>

      {/* Base Checkbox/Radio Column */}
      <div className="col-span-1 md:col-span-2 flex items-center gap-2 md:justify-center h-9">
        <Controller
          control={control}
          name={`units.${index}.is_base`}
          render={({ field }) => (
            <>
              <Checkbox
                id={`units-base-${index}`}
                checked={field.value}
                onCheckedChange={(checked) => {
                  if (checked) onSetBase();
                }}
                aria-label={copy.units.colBase}
              />
              <Label
                htmlFor={`units-base-${index}`}
                className="text-sm font-medium md:hidden cursor-pointer"
              >
                {copy.units.colBase}
              </Label>
            </>
          )}
        />
      </div>

      {/* Desktop Delete Button */}
      <div className="hidden md:flex md:col-span-1 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={copy.units.add}
          className="h-9 w-9"
        >
          <IconTrash className="size-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
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
      ...categoryOptions.map((c) => ({ value: String(c.id), label: c.name })),
    ],
    [categoryOptions],
  );

  async function handleSubmit(values: IngredientFormValues) {
    const categoryId =
      values.category_id && values.category_id !== NO_CATEGORY
        ? Number(values.category_id)
        : null;

    const { baseUnitId, unitsById, rowsByUnitId } = buildDerivationLookups(
      values.units,
      unitOptions,
    );

    let mappedUnits: {
      unit_id: number;
      to_base_factor: number;
      is_base: boolean;
      anchor_unit_id: number | null;
      anchor_factor: number | null;
      allow_purchase: boolean;
      allow_issue: boolean;
      allow_production: boolean;
    }[];
    try {
      mappedUnits = values.units.map((u) => {
        const unitId = Number(u.unit_id);
        const row = rowsByUnitId.get(unitId);
        const derivationRow: DerivationRow = row ?? {
          unit_id: unitId,
          is_base: u.is_base,
          anchor_unit_id: null,
          anchor_factor: null,
        };
        const toBase =
          baseUnitId == null
            ? Number(u.to_base_factor)
            : deriveToBaseFactor(
                baseUnitId,
                derivationRow,
                unitsById,
                rowsByUnitId,
              );
        const isPackaging =
          !u.is_base && unitsById.get(unitId)?.is_standard === false;
        return {
          unit_id: unitId,
          to_base_factor: toBase,
          is_base: u.is_base,
          anchor_unit_id: isPackaging ? derivationRow.anchor_unit_id : null,
          anchor_factor: isPackaging ? derivationRow.anchor_factor : null,
          allow_purchase: true,
          allow_issue: true,
          allow_production: true,
        };
      });
    } catch (error) {
      if (error instanceof UnitDerivationError) {
        return { success: false, error: copy.units.previewInvalid };
      }
      throw error;
    }

    const payload = {
      name: values.name,
      sku: values.sku || undefined,
      category_id: categoryId,
      unit_cost: parseOptionalNumber(values.unit_cost),
      item_kind: values.item_kind,
      storage_type: values.storage_type,
      min_stock_level: parseOptionalNumber(values.min_stock_level) ?? 0,
      max_stock_level: parseOptionalNumber(values.max_stock_level),
      reorder_point: parseOptionalNumber(values.reorder_point),
      shelf_life_days: parseOptionalNumber(values.shelf_life_days),
      units: mappedUnits,
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
      return {
        success: false,
        error: dialogCopy.saveFailed,
      };
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
      contentClassName="sm:max-w-3xl"
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
            <MoneyVndField
              control={form.control}
              name="unit_cost"
              label={dialogCopy.referenceCostLabel}
              placeholder="0"
            />
          </div>

          <UnitsField
            form={form}
            unitOptions={unitOptions}
            errorMessage={
              form.formState.errors.units?.root?.message ??
              form.formState.errors.units?.message
            }
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="storage_type"
              label={INVENTORY_VI.storageTypeLabel}
              options={STORAGE_OPTIONS}
            />
            <SelectField
              control={form.control}
              name="item_kind"
              label={dialogCopy.itemKindLabel}
              options={ITEM_KIND_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <QuantityField
              control={form.control}
              name="min_stock_level"
              label={dialogCopy.minStockLabel}
              maxFractionDigits={2}
            />
            <QuantityField
              control={form.control}
              name="max_stock_level"
              label={dialogCopy.maxStockLabel}
              maxFractionDigits={2}
            />
            <QuantityField
              control={form.control}
              name="reorder_point"
              label={dialogCopy.reorderPointLabel}
              maxFractionDigits={2}
            />
          </div>

          <NumberField
            control={form.control}
            name="shelf_life_days"
            label={dialogCopy.shelfLifeLabel}
            maxFractionDigits={0}
            placeholder={dialogCopy.shelfLifePlaceholder}
          />
        </>
      )}
    </FormDialog>
  );
}
