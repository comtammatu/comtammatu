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
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Combobox, MultiSelectCombobox } from "@/components/form";
import { FormattedNumberInput } from "./formatted-number-input";
import {
  getDefaultProductionUnit,
  getProductionUnitOptions,
} from "../_lib/production-units";
import type { IngredientUnitRow } from "../_lib/types";
import {
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";

export interface RecipeLineIngredient {
  id: number;
  name: string;
  unit: string;
  units?: IngredientUnitRow[];
}

export interface RecipeLineRowValue {
  ingredient_id: string;
  quantity: string;
  unit: string;
  entry_unit_id?: string;
  yield_factor: string;
  note?: string;
}

const GRID_TEMPLATE = "grid-cols-1 md:grid-cols-12";

const EMPTY_ROW: RecipeLineRowValue = {
  ingredient_id: "",
  quantity: "",
  unit: "",
  entry_unit_id: "",
  yield_factor: "1",
  note: "",
};

interface RecipeLinesEditorProps<T extends FieldValues> {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  getValues: UseFormGetValues<T>;
  errors: FieldErrors<T>;
  ingredients: RecipeLineIngredient[];
  name?: Path<T> & ArrayPath<T>;
  /** false → unit Input readOnly + auto-fill only when empty; true → editable + auto-fill on change. */
  unitEditable?: boolean;
  /** true → render the bulk-add MultiSelectCombobox. */
  bulkAdd?: boolean;
}

export function RecipeLinesEditor<T extends FieldValues>({
  control,
  setValue,
  getValues,
  errors,
  ingredients,
  name = "lines" as Path<T> & ArrayPath<T>,
  unitEditable = false,
  bulkAdd = false,
}: RecipeLinesEditorProps<T>) {
  const { fields, append, remove, replace } = useFieldArray<T, ArrayPath<T>>({
    control,
    name,
  });

  const ingredientMap = useMemo(() => {
    const m = new Map<number, RecipeLineIngredient>();
    for (const ing of ingredients) m.set(ing.id, ing);
    return m;
  }, [ingredients]);

  const lineErrors = (errors as Record<string, unknown>)[name] as
    | Array<FieldErrors<RecipeLineRowValue> | undefined>
    | undefined;

  const rows = fields as unknown as Array<RecipeLineRowValue & { id: string }>;

  const alreadySelectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.ingredient_id) ids.add(row.ingredient_id);
    }
    return ids;
  }, [rows]);

  function handleBulkAdd(ingredientIds: string[]) {
    const newRows: RecipeLineRowValue[] = ingredientIds.map((id) => {
      const ing = ingredientMap.get(Number(id));
      const defaultUnit = getDefaultProductionUnit(ing);
      return {
        ingredient_id: id,
        quantity: "",
        unit: defaultUnit?.code ?? ing?.unit ?? "",
        entry_unit_id: defaultUnit ? String(defaultUnit.unitId) : "",
        yield_factor: "1",
        note: "",
      };
    });
    const currentRows =
      (getValues(name) as unknown as RecipeLineRowValue[]) ?? [];
    const kept = currentRows
      .filter((row) => row.ingredient_id !== "")
      .map((row) => ({
        ingredient_id: row.ingredient_id,
        quantity: row.quantity,
        unit: row.unit,
        entry_unit_id: row.entry_unit_id ?? "",
        yield_factor: row.yield_factor,
        note: row.note ?? "",
      }));
    replace([...kept, ...newRows] as never);
  }

  function handleIngredientChange(index: number, value: string) {
    const ing = ingredientMap.get(Number(value));
    if (!ing) return;
    const unitPath = `${name}.${index}.unit` as Path<T>;
    const entryUnitPath = `${name}.${index}.entry_unit_id` as Path<T>;
    const defaultUnit = getDefaultProductionUnit(ing);
    if (unitEditable) {
      setValue(unitPath, (defaultUnit?.code ?? ing.unit) as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setValue(
        entryUnitPath,
        (defaultUnit ? String(defaultUnit.unitId) : "") as never,
        { shouldDirty: true },
      );
    } else {
      const currentUnit = getValues(unitPath);
      if (!currentUnit) {
        setValue(unitPath, (defaultUnit?.code ?? ing.unit) as never);
        setValue(
          entryUnitPath,
          (defaultUnit ? String(defaultUnit.unitId) : "") as never,
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        {bulkAdd ? (
          <MultiSelectCombobox
            options={ingredients.map((ing) => ({
              value: String(ing.id),
              label: ing.name,
              hint: ing.unit,
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

      <div className="overflow-hidden rounded-lg border">
        <div
          className={cn(
            "hidden items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid",
            GRID_TEMPLATE,
          )}
        >
          <div className="col-span-3">{PRODUCT_VI.rawIngredient}</div>
          <div className="col-span-2">{FORM_VI.quantity}</div>
          <div className="col-span-2">{FORM_VI.unit}</div>
          <div className="col-span-2">{INVENTORY_VI.yield}</div>
          <div className="col-span-2">{FORM_VI.notes}</div>
          <div />
        </div>

        <div className="divide-y">
          {rows.map((row, index) => (
            <RecipeLineRow<T>
              key={row.id}
              control={control}
              setValue={setValue}
              name={name}
              index={index}
              ingredients={ingredients}
              ingredientMap={ingredientMap}
              rowError={lineErrors?.[index]}
              unitEditable={unitEditable}
              canRemove={rows.length > 1}
              onRemove={() => remove(index)}
              onIngredientChange={(value) =>
                handleIngredientChange(index, value)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RecipeLineRow<T extends FieldValues>({
  control,
  setValue,
  name,
  index,
  ingredients,
  ingredientMap,
  rowError,
  unitEditable,
  canRemove,
  onRemove,
  onIngredientChange,
}: {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  name: Path<T>;
  index: number;
  ingredients: RecipeLineIngredient[];
  ingredientMap: Map<number, RecipeLineIngredient>;
  rowError: FieldErrors<RecipeLineRowValue> | undefined;
  unitEditable: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onIngredientChange: (value: string) => void;
}) {
  const ingredientName = `${name}.${index}.ingredient_id` as Path<T>;
  const quantityName = `${name}.${index}.quantity` as Path<T>;
  const unitName = `${name}.${index}.unit` as Path<T>;
  const entryUnitName = `${name}.${index}.entry_unit_id` as Path<T>;
  const yieldName = `${name}.${index}.yield_factor` as Path<T>;
  const noteName = `${name}.${index}.note` as Path<T>;

  const selectedIngredientId = useWatch({ control, name: ingredientName }) as
    | string
    | undefined;
  const selectedIngredient = selectedIngredientId
    ? ingredientMap.get(Number(selectedIngredientId))
    : undefined;
  const unitOptions = getProductionUnitOptions(selectedIngredient);

  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn("grid items-center gap-2 px-3 py-2", GRID_TEMPLATE)}>
        <div className="min-w-0 md:col-span-3">
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
                  hint: ing.unit,
                }))}
                placeholder={INVENTORY_VI.selectIngredientPlaceholder}
                searchPlaceholder={INVENTORY_VI.searchByName}
                aria-invalid={!!rowError?.ingredient_id}
                triggerClassName={cn(
                  "h-9",
                  rowError?.ingredient_id && "border-destructive",
                )}
              />
            )}
          />
        </div>

        <div className="min-w-0 md:col-span-2">
          <Controller
            control={control}
            name={quantityName}
            render={({ field }) => (
              <FormattedNumberInput
                placeholder="VD: 0.5"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                maxFractionDigits={3}
                aria-invalid={!!rowError?.quantity}
                className={cn("h-9", rowError?.quantity && "border-destructive")}
              />
            )}
          />
        </div>

        <div className="min-w-0 md:col-span-2">
          {unitOptions.length > 0 ? (
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
                      setValue(unitName, opt.code as never, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                >
                  <SelectTrigger
                    className={cn("h-9", rowError?.unit && "border-destructive")}
                    aria-invalid={!!rowError?.unit}
                    aria-label={FORM_VI.unit}
                  >
                    <SelectValue placeholder={INVENTORY_VI.selectUnit} />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((opt) => (
                      <SelectItem key={opt.unitId} value={String(opt.unitId)}>
                        {opt.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <Controller
              control={control}
              name={unitName}
              render={({ field }) => (
                <Input
                  placeholder={INVENTORY_VI.unitPlaceholder}
                  {...field}
                  value={field.value ?? ""}
                  readOnly={!unitEditable}
                  aria-invalid={!!rowError?.unit}
                  className={cn(
                    "h-9",
                    !unitEditable && "bg-muted/40",
                    rowError?.unit && "border-destructive",
                  )}
                />
              )}
            />
          )}
        </div>

        <div className="min-w-0 md:col-span-2">
          <Controller
            control={control}
            name={yieldName}
            render={({ field }) => (
              <FormattedNumberInput
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                maxFractionDigits={2}
                aria-invalid={!!rowError?.yield_factor}
                className={cn(
                  "h-9",
                  rowError?.yield_factor && "border-destructive",
                )}
              />
            )}
          />
        </div>

        <div className="min-w-0 md:col-span-2">
          <Controller
            control={control}
            name={noteName}
            render={({ field }) => (
              <Input
                placeholder={STATES_VI.optional}
                {...field}
                value={field.value ?? ""}
                className="h-9"
              />
            )}
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={INVENTORY_VI.removeRow}
        >
          <IconTrash className="size-4 text-muted-foreground" />
        </Button>
      </div>
      {rowError && (
        <p className="px-3 text-xs text-destructive" role="alert">
          {rowError.ingredient_id?.message ??
            rowError.quantity?.message ??
            rowError.unit?.message ??
            rowError.yield_factor?.message}
        </p>
      )}
    </div>
  );
}
