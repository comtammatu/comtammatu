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
  FormattedNumberInput,
} from "@/components/form";
import {
  getDefaultIngredientUnit,
  getIngredientRoleUnit,
  getIngredientUnitOptions,
  type InventoryUnitOption,
} from "@lib/inventory/unit-options";
import type { IngredientUnitRow } from "@lib/inventory/types";
import {
  FORM_VI,
  INVENTORY_VI,
  PRODUCT_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";

export interface IngredientLineOption {
  id: number;
  name: string;
  unitLabel: string;
  receipt_unit_id?: number | null;
  issue_unit_id?: number | null;
  units?: IngredientUnitRow[];
}

function getLineUnitOptions(
  ingredient: IngredientLineOption | undefined,
): InventoryUnitOption[] {
  return getIngredientUnitOptions(ingredient);
}

function getDefaultLineUnit(
  ingredient: IngredientLineOption | undefined,
): InventoryUnitOption | null {
  return (
    getIngredientRoleUnit(ingredient, "issue") ??
    getDefaultIngredientUnit(getIngredientUnitOptions(ingredient))
  );
}

export interface IngredientLineRowValue {
  ingredient_id: string;
  quantity: string;
  unitLabel: string;
  entry_unit_id?: string;
  note?: string;
}

const GRID_TEMPLATE = "grid-cols-1 md:grid-cols-12";

const EMPTY_ROW: IngredientLineRowValue = {
  ingredient_id: "",
  quantity: "",
  unitLabel: "",
  entry_unit_id: "",
  note: "",
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
    | IngredientLineRowValue[]
    | undefined;

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
              hint:
                getDefaultLineUnit(ing)?.label ?? ing.unitLabel,
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
          <div className="col-span-3">{PRODUCT_VI.rawIngredient}</div>
          <div className="col-span-2">{FORM_VI.quantity}</div>
          <div className="col-span-2">{FORM_VI.unit}</div>
          <div className="col-span-4">{FORM_VI.notes}</div>
          <div />
        </div>

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
              onRemove={() => remove(index)}
              onIngredientChange={(value) =>
                handleIngredientChange(index, value)
              }
            />
          ))}
        </div>
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
  onRemove: () => void;
  onIngredientChange: (value: string) => void;
}) {
  const ingredientName = `${name}.${index}.ingredient_id` as Path<T>;
  const quantityName = `${name}.${index}.quantity` as Path<T>;
  const unitLabelName = `${name}.${index}.unitLabel` as Path<T>;
  const entryUnitName = `${name}.${index}.entry_unit_id` as Path<T>;
  const noteName = `${name}.${index}.note` as Path<T>;

  const selectedIngredientId = useWatch({ control, name: ingredientName }) as
    string | undefined;
  const selectedIngredient = selectedIngredientId
    ? ingredientMap.get(Number(selectedIngredientId))
    : undefined;
  const unitOptions = getLineUnitOptions(selectedIngredient);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "grid items-center gap-2 px-3 py-2",
          GRID_TEMPLATE,
        )}
      >
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
                  hint:
                    getDefaultLineUnit(ing)?.label ?? ing.unitLabel,
                }))}
                placeholder={INVENTORY_VI.selectIngredientPlaceholder}
                searchPlaceholder={INVENTORY_VI.searchByName}
                aria-label={`${PRODUCT_VI.rawIngredient} ${index + 1}`}
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
                  "h-9",
                  rowError?.quantity && "border-destructive",
                )}
              />
            )}
          />
        </div>

        <div className="min-w-0 md:col-span-2">
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
                      "h-9",
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

        <div className="min-w-0 md:col-span-4">
          <Controller
            control={control}
            name={noteName}
            render={({ field }) => (
              <Input
                placeholder={STATES_VI.optional}
                aria-label={`${FORM_VI.notes} ${index + 1}`}
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
      {rowError ? (
        <p className="px-3 text-xs text-destructive" role="alert">
          {rowError.ingredient_id?.message ??
            rowError.quantity?.message ??
            rowError.entry_unit_id?.message ??
            rowError.unitLabel?.message}
        </p>
      ) : null}
    </div>
  );
}
