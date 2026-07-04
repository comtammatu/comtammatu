"use client";

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
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

const copy = messages.inventoryMaster.ingredientForm;
const dialogCopy = messages.inventory.ingredients.dialog;

const NO_CATEGORY = "none";

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
  is_base: z.boolean(),
  allow_purchase: z.boolean(),
  allow_issue: z.boolean(),
  allow_production: z.boolean(),
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
    is_base: true,
    allow_purchase: true,
    allow_issue: true,
    allow_production: false,
  };
}

function makeSecondaryRow(): UnitFormRow {
  return {
    unit_id: "",
    to_base_factor: "1",
    is_base: false,
    allow_purchase: false,
    allow_issue: false,
    allow_production: true,
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
          is_base: u.is_base,
          allow_purchase: u.allow_purchase,
          allow_issue: u.allow_issue,
          allow_production: u.allow_production,
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

  function setBase(targetIndex: number) {
    fields.forEach((_, index) => {
      const isTarget = index === targetIndex;
      // Radio semantics: checking one base unchecks the others.
      form.setValue(`units.${index}.is_base`, isTarget, {
        shouldValidate: true,
      });
      if (isTarget) {
        form.setValue(`units.${index}.to_base_factor`, "1", {
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
        <div className="hidden grid-cols-12 items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-3">{copy.units.colUnit}</div>
          <div className="col-span-2">{copy.units.colFactor}</div>
          <div className="text-center">{copy.units.colBase}</div>
          <div className="col-span-2 text-center">{copy.units.colPurchase}</div>
          <div className="text-center">{copy.units.colIssue}</div>
          <div className="col-span-2 text-center">
            {copy.units.colProduction}
          </div>
          <div />
        </div>

        <div className="divide-y">
          {fields.map((row, index) => (
            <UnitRowCells
              key={row.id}
              control={form.control}
              index={index}
              unitOptions={unitOptions}
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
  onSetBase,
  onRemove,
  rowCount,
}: {
  control: Control<IngredientFormValues>;
  index: number;
  unitOptions: UnitOption[];
  onSetBase: () => void;
  onRemove: () => void;
  rowCount: number;
}) {
  const isBase = useWatch({ control, name: `units.${index}.is_base` }) ?? false;
  const canRemove = rowCount > 1 && !isBase;

  return (
    <div className="grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-12">
      <div className="min-w-0 md:col-span-3">
        <Controller
          control={control}
          name={`units.${index}.unit_id`}
          render={({ field, fieldState }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                className={cn("h-9", fieldState.error && "border-destructive")}
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

      <div className="min-w-0 md:col-span-2">
        <Controller
          control={control}
          name={`units.${index}.to_base_factor`}
          render={({ field, fieldState }) => (
            <FormattedNumberInput
              value={field.value ?? ""}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              name={field.name}
              maxFractionDigits={6}
              disabled={isBase}
              aria-invalid={!!fieldState.error}
              className={cn(
                "h-9",
                isBase && "bg-muted/40",
                fieldState.error && "border-destructive",
              )}
            />
          )}
        />
      </div>

      <Controller
        control={control}
        name={`units.${index}.is_base`}
        render={({ field }) => (
          <div className="flex justify-center">
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => {
                if (checked) onSetBase();
              }}
              aria-label={copy.units.colBase}
            />
          </div>
        )}
      />

      <div className="md:col-span-2">
        <Controller
          control={control}
          name={`units.${index}.allow_purchase`}
          render={({ field }) => (
            <div className="flex justify-center">
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                aria-label={copy.units.colPurchase}
              />
            </div>
          )}
        />
      </div>

      <Controller
        control={control}
        name={`units.${index}.allow_issue`}
        render={({ field }) => (
          <div className="flex justify-center">
            <Checkbox
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              aria-label={copy.units.colIssue}
            />
          </div>
        )}
      />

      <div className="md:col-span-2">
        <Controller
          control={control}
          name={`units.${index}.allow_production`}
          render={({ field }) => (
            <div className="flex justify-center">
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                aria-label={copy.units.colProduction}
              />
            </div>
          )}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={copy.units.add}
      >
        <IconTrash className="size-4 text-muted-foreground" />
      </Button>
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
      units: values.units.map((u) => ({
        unit_id: Number(u.unit_id),
        to_base_factor: Number(u.to_base_factor),
        is_base: u.is_base,
        allow_purchase: u.allow_purchase,
        allow_issue: u.allow_issue,
        allow_production: u.allow_production,
      })),
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
