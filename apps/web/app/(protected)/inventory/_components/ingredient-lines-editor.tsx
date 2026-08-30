"use client";

import { useMemo } from "react";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type ArrayPath,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormGetValues,
  type UseFormSetValue,
} from "react-hook-form";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Frame } from "@comtammatu/ui/components/frame";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Combobox,
  MultiSelectCombobox,
  QuantityInput,
} from "@/components/form";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  getDefaultIngredientUnit,
  getIngredientUnitOptions,
  type InventoryUnitOption,
} from "@lib/inventory/unit-options";
import type { IngredientUnitRow } from "@lib/inventory/types";
import type { MenuRecipeCostSignal } from "../_lib/menu-recipe-cost";
import {
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";

export interface IngredientLineOption {
  id: number;
  name: string;
  unitLabel: string;
  units?: IngredientUnitRow[];
  /** Menu-recipe editor: missing Nguồn hàng / Kho gốc WAC. */
  costSignals?: readonly MenuRecipeCostSignal[];
}

function costSignalLabel(signal: MenuRecipeCostSignal): string {
  switch (signal) {
    case "missing_fulfill_site":
      return INVENTORY_VI.menuRecipeMissingFulfillSite;
    case "missing_source_wac":
      return INVENTORY_VI.menuRecipeMissingSourceWac;
    case "source_wac_site_mismatch":
      return INVENTORY_VI.menuRecipeSourceWacSiteMismatch;
    default: {
      const _exhaustive: never = signal;
      return _exhaustive;
    }
  }
}

function getLineUnitOptions(
  ingredient: IngredientLineOption | undefined,
): InventoryUnitOption[] {
  return getIngredientUnitOptions(ingredient);
}

function getDefaultLineUnit(
  ingredient: IngredientLineOption | undefined,
): InventoryUnitOption | null {
  return getDefaultIngredientUnit(getIngredientUnitOptions(ingredient));
}

export interface IngredientLineRowValue {
  ingredient_id: string;
  quantity: string;
  unitLabel: string;
  entry_unit_id?: string;
  note?: string;
  is_primary?: boolean;
}

const GRID_TEMPLATE = "grid-cols-1 md:grid-cols-12";

const EMPTY_ROW: IngredientLineRowValue = {
  ingredient_id: "",
  quantity: "",
  unitLabel: "",
  entry_unit_id: "",
  note: "",
  is_primary: false,
};

interface IngredientLinesEditorProps<T extends FieldValues> {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  getValues: UseFormGetValues<T>;
  errors: FieldErrors<T>;
  ingredients: IngredientLineOption[];
  name?: Path<T> & ArrayPath<T>;
  /** false → readonly default unit; true → selectable from active units. */
  unitEditable?: boolean;
  /** true → render the bulk-add MultiSelectCombobox. */
  bulkAdd?: boolean;
  /** true → render the is_primary (Nguyên liệu chính) toggle column. */
  showPrimaryToggle?: boolean;
}

export function IngredientLinesEditor<T extends FieldValues>({
  control,
  setValue,
  getValues,
  errors,
  ingredients,
  name = "lines" as Path<T> & ArrayPath<T>,
  unitEditable = false,
  bulkAdd = false,
  showPrimaryToggle = false,
}: IngredientLinesEditorProps<T>) {
  const { fields, append, remove, replace } = useFieldArray<T, ArrayPath<T>>({
    control,
    name,
  });

  const ingredientMap = useMemo(() => {
    const m = new Map<number, IngredientLineOption>();
    for (const ing of ingredients) m.set(ing.id, ing);
    return m;
  }, [ingredients]);

  const lineErrors = (errors as Record<string, unknown>)[name] as
    Array<FieldErrors<IngredientLineRowValue> | undefined> | undefined;

  const rows = fields as unknown as Array<
    IngredientLineRowValue & { id: string }
  >;
  const watchedRows = useWatch({ control, name }) as
    IngredientLineRowValue[] | undefined;

  const alreadySelectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of watchedRows ?? []) {
      if (row.ingredient_id) ids.add(row.ingredient_id);
    }
    return ids;
  }, [watchedRows]);

  function handleBulkAdd(ingredientIds: string[]) {
    const newRows: IngredientLineRowValue[] = ingredientIds.map((id) => {
      const ing = ingredientMap.get(Number(id));
      const defaultUnit = getDefaultLineUnit(ing);
      return {
        ingredient_id: id,
        quantity: "",
        unitLabel: defaultUnit?.label ?? "",
        entry_unit_id: defaultUnit ? String(defaultUnit.unitId) : "",
        note: "",
        is_primary: false,
      };
    });
    const currentRows =
      (getValues(name) as unknown as IngredientLineRowValue[]) ?? [];
    const kept = currentRows
      .filter((row) => row.ingredient_id !== "")
      .map((row) => ({
        ingredient_id: row.ingredient_id,
        quantity: row.quantity,
        unitLabel: row.unitLabel,
        entry_unit_id: row.entry_unit_id ?? "",
        note: row.note ?? "",
        is_primary: row.is_primary ?? false,
      }));
    replace([...kept, ...newRows] as never);
  }

  function handleIngredientChange(index: number, value: string) {
    const ing = ingredientMap.get(Number(value));
    if (!ing) return;
    const unitLabelPath = `${name}.${index}.unitLabel` as Path<T>;
    const entryUnitPath = `${name}.${index}.entry_unit_id` as Path<T>;
    const defaultUnit = getDefaultLineUnit(ing);
    setValue(unitLabelPath, (defaultUnit?.label ?? "") as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(
      entryUnitPath,
      (defaultUnit ? String(defaultUnit.unitId) : "") as never,
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        {bulkAdd ? (
          <MultiSelectCombobox
            options={ingredients.map((ing) => ({
              value: String(ing.id),
              label: ing.name,
              hint: getDefaultLineUnit(ing)?.label ?? ing.unitLabel,
              alreadySelected: alreadySelectedIds.has(String(ing.id)),
            }))}
            onConfirm={handleBulkAdd}
            triggerLabel={INVENTORY_VI.selectMultipleIngredients}
            confirmLabel={(n) =>
              n > 0 ? `Thêm ${n} nguyên liệu` : "Thêm nguyên liệu"
            }
            searchPlaceholder={INVENTORY_VI.searchByName}
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(EMPTY_ROW as never)}
        >
          <IconPlus className="size-4" />
          {INVENTORY_VI.addOneRow}
        </Button>
      </div>

      <Frame className="overflow-hidden">
        <div
          className={cn(
            "hidden items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid",
            GRID_TEMPLATE,
          )}
        >
          <div className={showPrimaryToggle ? "col-span-5" : "col-span-6"}>
            {PRODUCT_VI.rawIngredient}
          </div>
          <div className="col-span-3">{FORM_VI.quantity}</div>
          <div className="col-span-2">{FORM_VI.unit}</div>
          {showPrimaryToggle ? (
            <div
              className="col-span-1 text-center"
              title={INVENTORY_VI.isPrimaryIngredientHint}
            >
              {INVENTORY_VI.primaryBadge}
            </div>
          ) : null}
          <div className={showPrimaryToggle ? "col-span-1" : ""} />
        </div>

        <ScrollArea className="h-80">
          <div className="divide-y">
            {rows.map((row, index) => (
              <IngredientLineRow<T>
                key={row.id}
                control={control}
                setValue={setValue}
                name={name}
                index={index}
                ingredients={ingredients}
                ingredientMap={ingredientMap}
                rowError={lineErrors?.[index]}
                canRemove={rows.length > 1}
                unitEditable={unitEditable}
                showPrimaryToggle={showPrimaryToggle}
                onRemove={() => remove(index)}
                onIngredientChange={(value) =>
                  handleIngredientChange(index, value)
                }
              />
            ))}
          </div>
        </ScrollArea>
      </Frame>
    </div>
  );
}

function IngredientLineRow<T extends FieldValues>({
  control,
  setValue,
  name,
  index,
  ingredients,
  ingredientMap,
  rowError,
  canRemove,
  unitEditable,
  showPrimaryToggle,
  onRemove,
  onIngredientChange,
}: {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  name: Path<T>;
  index: number;
  ingredients: IngredientLineOption[];
  ingredientMap: Map<number, IngredientLineOption>;
  rowError: FieldErrors<IngredientLineRowValue> | undefined;
  canRemove: boolean;
  unitEditable: boolean;
  showPrimaryToggle?: boolean;
  onRemove: () => void;
  onIngredientChange: (value: string) => void;
}) {
  const ingredientName = `${name}.${index}.ingredient_id` as Path<T>;
  const quantityName = `${name}.${index}.quantity` as Path<T>;
  const unitLabelName = `${name}.${index}.unitLabel` as Path<T>;
  const entryUnitName = `${name}.${index}.entry_unit_id` as Path<T>;
  const isPrimaryName = `${name}.${index}.is_primary` as Path<T>;

  const selectedIngredientId = useWatch({ control, name: ingredientName }) as
    string | undefined;
  const selectedIngredient = selectedIngredientId
    ? ingredientMap.get(Number(selectedIngredientId))
    : undefined;
  const unitOptions = getLineUnitOptions(selectedIngredient);

  return (
    <div className="flex flex-col gap-1.5 p-2 md:p-0">
      <div className="flex items-center justify-between gap-2 px-1 text-xs font-medium text-muted-foreground md:hidden">
        <span>#{index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={INVENTORY_VI.removeRow}
        >
          <IconTrash className="size-4 text-muted-foreground" />
        </Button>
      </div>

      <div className={cn("grid items-center gap-2 px-3 py-2", GRID_TEMPLATE)}>
        <div
          className={cn(
            "min-w-0",
            showPrimaryToggle ? "md:col-span-5" : "md:col-span-6",
          )}
        >
          <span className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
            {PRODUCT_VI.rawIngredient}
          </span>
          <Controller
            control={control}
            name={ingredientName}
            render={({ field }) => (
              <Combobox
                value={field.value ?? ""}
                onValueChange={(v) => {
                  field.onChange(v);
                  onIngredientChange(v);
                }}
                options={ingredients.map((ing) => ({
                  value: String(ing.id),
                  label: ing.name,
                  hint: getDefaultLineUnit(ing)?.label ?? ing.unitLabel,
                }))}
                placeholder={INVENTORY_VI.selectIngredientPlaceholder}
                searchPlaceholder={INVENTORY_VI.searchByName}
                aria-label={`${PRODUCT_VI.rawIngredient} ${index + 1}`}
                aria-invalid={!!rowError?.ingredient_id}
                triggerClassName={cn(
                  rowError?.ingredient_id && "border-destructive",
                )}
              />
            )}
          />
        </div>

        <div className="min-w-0 md:col-span-3">
          <span className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
            {FORM_VI.quantity}
          </span>
          <Controller
            control={control}
            name={quantityName}
            render={({ field }) => (
              <QuantityInput
                placeholder={INVENTORY_VI.quantityExamplePlaceholder}
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                aria-label={`${FORM_VI.quantity} ${index + 1}`}
                maxFractionDigits={3}
                aria-invalid={!!rowError?.quantity}
                className={cn(
                  rowError?.quantity && "border-destructive",
                )}
              />
            )}
          />
        </div>

        <div className="min-w-0 md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
            {FORM_VI.unit}
          </span>
          {unitEditable && unitOptions.length > 0 ? (
            <Controller
              control={control}
              name={entryUnitName}
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const opt = unitOptions.find(
                      (o) => String(o.unitId) === value,
                    );
                    if (opt) {
                      setValue(unitLabelName, opt.label as never, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      (rowError?.unitLabel || rowError?.entry_unit_id) &&
                        "border-destructive",
                    )}
                    aria-invalid={
                      !!rowError?.unitLabel || !!rowError?.entry_unit_id
                    }
                    aria-label={`${FORM_VI.unit} ${index + 1}`}
                  >
                    <SelectValue placeholder={INVENTORY_VI.selectUnit} />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((opt) => (
                      <SelectItem key={opt.unitId} value={String(opt.unitId)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <Controller
              control={control}
              name={unitLabelName}
              render={({ field }) => (
                <Input
                  placeholder={INVENTORY_VI.unitPlaceholder}
                  {...field}
                  value={field.value ?? ""}
                  readOnly
                  aria-readonly="true"
                  aria-invalid={!!rowError?.unitLabel}
                  className={cn(
                    "h-9",
                    "bg-muted",
                    rowError?.unitLabel && "border-destructive",
                  )}
                />
              )}
            />
          )}
        </div>

        {showPrimaryToggle ? (
          <div className="min-w-0 md:col-span-1 md:flex md:items-center md:justify-center">
            <Controller
              control={control}
              name={isPrimaryName}
              render={({ field }) => (
                <label
                  className="flex cursor-pointer items-center gap-2 md:justify-center"
                  title={INVENTORY_VI.isPrimaryIngredientHint}
                >
                  <span className="text-xs font-medium text-muted-foreground md:hidden">
                    {INVENTORY_VI.isPrimaryIngredient}
                  </span>
                  <Checkbox
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                    aria-label={`${INVENTORY_VI.isPrimaryIngredient} ${index + 1}`}
                  />
                </label>
              )}
            />
          </div>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={INVENTORY_VI.removeRow}
          className="hidden md:inline-flex"
        >
          <IconTrash className="size-4 text-muted-foreground" />
        </Button>
      </div>
      {rowError ? (
        <p className="px-3 text-xs text-destructive" role="alert">
          {rowError.ingredient_id?.message ??
            rowError.quantity?.message ??
            rowError.entry_unit_id?.message ??
            rowError.unitLabel?.message}
        </p>
      ) : null}
      {selectedIngredient?.costSignals &&
      selectedIngredient.costSignals.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {selectedIngredient.costSignals.map((signal) => (
            <Badge key={signal} variant="destructive" className="text-xs">
              {costSignalLabel(signal)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
