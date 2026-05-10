"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ClipboardPaste as IconClipboardPaste,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Combobox, MultiSelectCombobox } from "@/components/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "../_components/formatted-number-input";
import { parseInventoryBulkLines } from "../_lib/bulk-line-parser";
import { upsertRecipeLines } from "../procurement-actions";
import {
  ACTIONS_VI,
  ERRORS_VI,
  FORM_VI,
  PRODUCT_VI,
} from "@comtammatu/shared/messages";

export interface MenuItemOption {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

export interface RecipeLineDraft {
  ingredientId: number;
  quantity: number;
  unit: string;
  yieldFactor: number;
  note: string | null;
}

/* ─── Schema ─── */

const recipeLineRowSchema = z.object({
  ingredient_id: z.string().min(1, { error: "Chọn nguyên liệu" }),
  quantity: z
    .string()
    .min(1, { error: "Nhập số lượng" })
    .refine((v) => Number(v) > 0, { error: "Số lượng phải > 0" }),
  unit: z.string().trim().min(1, { error: "Đơn vị không được trống" }),
  yield_factor: z
    .string()
    .min(1, { error: "Nhập yield" })
    .refine((v) => Number(v) > 0, { error: "Hệ số sản lượng phải > 0" }),
  note: z.string().max(200, { error: "Ghi chú tối đa 200 ký tự" }).optional(),
});

const recipeSchema = z.object({
  menu_item_id: z.string().min(1, { error: "Vui lòng chọn món bán" }),
  lines: z
    .array(recipeLineRowSchema)
    .min(1, { error: "Định mức món bán phải có ít nhất 1 nguyên liệu" })
    .refine(
      (arr) => {
        const ids = arr.map((row) => row.ingredient_id).filter(Boolean);
        return new Set(ids).size === ids.length;
      },
      { error: "Nguyên liệu trùng lặp. Gộp chung vào 1 dòng." },
    ),
});

type RecipeFormValues = z.infer<typeof recipeSchema>;
type RecipeLineRow = z.infer<typeof recipeLineRowSchema>;

const EMPTY_ROW: RecipeLineRow = {
  ingredient_id: "",
  quantity: "",
  unit: "",
  yield_factor: "1",
  note: "",
};

function parsePastedRecipeLines(
  rawText: string,
  ingredients: IngredientOption[],
) {
  const result = parseInventoryBulkLines({
    text: rawText,
    items: ingredients,
    getUnit: (ingredient) => ingredient.unit,
  });

  return {
    parsed: result.parsed.map(({ item, quantity, note }) => ({
      ingredient_id: String(item.id),
      quantity,
      unit: item.unit,
      yield_factor: "1",
      note,
    })),
    issues: result.issues,
  };
}

/* ─── Row ─── */

function RecipeLineEditor({
  form,
  index,
  ingredients,
  line,
  onRemove,
  onIngredientChange,
}: {
  form: ReturnType<typeof useForm<RecipeFormValues, unknown, RecipeFormValues>>;
  index: number;
  ingredients: IngredientOption[];
  line: RecipeLineRow;
  onRemove: () => void;
  onIngredientChange: (ingredientId: string) => void;
}) {
  const { control } = form;
  const ingredient = ingredients.find(
    (item) => item.id === Number(line.ingredient_id),
  );
  const errors = form.formState.errors;
  const rowError = errors.lines?.[index];

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Dòng {index + 1}</Badge>
            {ingredient ? (
              <Badge variant="outline">{ingredient.unit}</Badge>
            ) : null}
          </div>
          <div className="min-h-5 truncate font-medium">
            {ingredient?.name ?? "Chưa chọn nguyên liệu"}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="Xóa dòng"
        >
          <IconTrash className="size-4 text-muted-foreground" />
        </Button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-sm font-medium">
            {PRODUCT_VI.rawIngredient}
          </Label>
          <Controller
            control={control}
            name={`lines.${index}.ingredient_id`}
            render={({ field }) => (
              <Combobox
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  onIngredientChange(v);
                }}
                options={ingredients.map((ing) => ({
                  value: String(ing.id),
                  label: ing.name,
                  hint: ing.unit,
                }))}
                placeholder="Chọn nguyên liệu..."
                searchPlaceholder="Tìm theo tên..."
                aria-invalid={!!rowError?.ingredient_id}
                triggerClassName={cn(
                  rowError?.ingredient_id && "border-destructive",
                )}
              />
            )}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">{FORM_VI.quantity}</Label>
          <Controller
            control={control}
            name={`lines.${index}.quantity`}
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
                className={cn(rowError?.quantity && "border-destructive")}
              />
            )}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">{FORM_VI.unit}</Label>
          <Controller
            control={control}
            name={`lines.${index}.unit`}
            render={({ field }) => (
              <Input
                placeholder="kg, lít..."
                {...field}
                value={field.value ?? ""}
                readOnly
                aria-invalid={!!rowError?.unit}
                className={cn(
                  "bg-muted/40",
                  rowError?.unit && "border-destructive",
                )}
              />
            )}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Yield</Label>
          <Controller
            control={control}
            name={`lines.${index}.yield_factor`}
            render={({ field }) => (
              <FormattedNumberInput
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
                maxFractionDigits={2}
                aria-invalid={!!rowError?.yield_factor}
                className={cn(rowError?.yield_factor && "border-destructive")}
              />
            )}
          />
        </div>

        <div className="md:col-span-2">
          <Label className="text-sm font-medium">{FORM_VI.notes}</Label>
          <Controller
            control={control}
            name={`lines.${index}.note`}
            render={({ field }) => (
              <Input
                placeholder="Tùy chọn"
                {...field}
                value={field.value ?? ""}
              />
            )}
          />
        </div>
      </div>

      {rowError ? (
        <p className="px-3 text-xs text-destructive" role="alert">
          {rowError.ingredient_id?.message ??
            rowError.quantity?.message ??
            rowError.unit?.message ??
            rowError.yield_factor?.message}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Dialog ─── */

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuItems: MenuItemOption[];
  ingredients: IngredientOption[];
  editingMenuItemId?: number;
  editingLines?: RecipeLineDraft[];
  existingMenuItemIds?: number[];
  onSaved: () => void;
}

export function RecipeLineDialog({
  open,
  onOpenChange,
  menuItems,
  ingredients,
  editingMenuItemId,
  editingLines,
  existingMenuItemIds = [],
  onSaved,
}: RecipeDialogProps) {
  const isEdit = editingMenuItemId != null;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkIssues, setBulkIssues] = useState<string[]>([]);
  const [isBulkPasteExpanded, setBulkPasteExpanded] = useState(true);

  const availableMenuItems = useMemo(() => {
    if (isEdit) return menuItems;
    const blocked = new Set(existingMenuItemIds);
    return menuItems.filter((mi) => !blocked.has(mi.id));
  }, [menuItems, existingMenuItemIds, isEdit]);

  const defaultCreateMenuItemId = availableMenuItems[0]?.id;

  const initialValues = useMemo<RecipeFormValues>(
    () => ({
      menu_item_id: editingMenuItemId
        ? String(editingMenuItemId)
        : defaultCreateMenuItemId != null
          ? String(defaultCreateMenuItemId)
          : "",
      lines:
        editingLines && editingLines.length > 0
          ? editingLines.map((l) => ({
              ingredient_id: String(l.ingredientId),
              quantity: String(l.quantity),
              unit: l.unit,
              yield_factor: String(l.yieldFactor),
              note: l.note ?? "",
            }))
          : [],
    }),
    [editingMenuItemId, editingLines, defaultCreateMenuItemId],
  );

  const form = useForm<RecipeFormValues, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: initialValues,
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const watchedLines = form.watch("lines");
  const alreadySelectedIngredientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of watchedLines ?? []) {
      if (line?.ingredient_id) ids.add(line.ingredient_id);
    }
    return ids;
  }, [watchedLines]);

  function handleBulkAddIngredients(ingredientIds: string[]) {
    const kept = (form.getValues("lines") ?? []).filter(
      (row) => row.ingredient_id !== "",
    );
    const seenIds = new Set(kept.map((row) => row.ingredient_id));
    const newRows: RecipeLineRow[] = [];

    ingredientIds.forEach((id) => {
      if (seenIds.has(id)) return;
      const ingredient = ingredientMap.get(Number(id));
      if (!ingredient) return;
      newRows.push({
        ingredient_id: id,
        quantity: "",
        unit: ingredient.unit,
        yield_factor: "1",
        note: "",
      });
      seenIds.add(id);
    });

    replace([...kept, ...newRows]);
    setBulkIssues([]);
  }

  function handleApplyPastedLines() {
    const { parsed, issues } = parsePastedRecipeLines(bulkText, ingredients);

    if (parsed.length === 0) {
      setBulkIssues(issues.length > 0 ? issues : ["Không có dòng hợp lệ"]);
      return;
    }

    const nextRows = (form.getValues("lines") ?? []).filter(
      (row) => row.ingredient_id !== "",
    );
    const indexByIngredientId = new Map<string, number>();
    nextRows.forEach((row, index) => {
      indexByIngredientId.set(row.ingredient_id, index);
    });

    parsed.forEach((line) => {
      const existingIndex = indexByIngredientId.get(line.ingredient_id);
      if (existingIndex == null) {
        indexByIngredientId.set(line.ingredient_id, nextRows.length);
        nextRows.push(line);
        return;
      }

      const existingLine = nextRows[existingIndex];
      if (!existingLine) return;
      nextRows[existingIndex] = {
        ...existingLine,
        quantity: line.quantity,
        unit: line.unit,
        yield_factor: existingLine.yield_factor || "1",
        note: line.note || existingLine.note,
      };
    });

    replace(nextRows);
    if (issues.length === 0) setBulkText("");
    setBulkIssues(issues);
    setBulkPasteExpanded(issues.length > 0);
    toast.success(`Đã nhập nhanh ${parsed.length} nguyên liệu`);
  }

  useEffect(() => {
    if (open) {
      form.reset(initialValues);
      setServerError(null);
      setBulkText("");
      setBulkIssues([]);
      setBulkPasteExpanded(true);
    }
  }, [open, initialValues, form]);

  const ingredientMap = useMemo(() => {
    const m = new Map<number, IngredientOption>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  function handleIngredientChangeFactory(rowIndex: number) {
    return (value: string) => {
      const currentUnit = form.getValues(`lines.${rowIndex}.unit`);
      if (!currentUnit) {
        const ing = ingredientMap.get(Number(value));
        if (ing) {
          form.setValue(`lines.${rowIndex}.unit`, ing.unit);
        }
      }
    };
  }

  function onValid(values: RecipeFormValues) {
    const menuItemId = Number(values.menu_item_id);
    const parsedLines = values.lines.map((row) => ({
      ingredientId: Number(row.ingredient_id),
      quantity: Number(row.quantity),
      unit: row.unit.trim(),
      yieldFactor: Number(row.yield_factor || "1"),
      note: row.note?.trim() ? row.note.trim() : null,
    }));

    startTransition(async () => {
      setServerError(null);
      const result = await upsertRecipeLines({
        menuItemId,
        lines: parsedLines,
      });
      if (!result.success) {
        setServerError(result.error ?? ERRORS_VI.fallback);
        return;
      }
      toast.success(
        isEdit
          ? `Đã cập nhật định mức món bán (${parsedLines.length} nguyên liệu)`
          : `Đã tạo định mức món bán (${parsedLines.length} nguyên liệu)`,
      );
      onOpenChange(false);
      onSaved();
    });
  }

  const errors = form.formState.errors;
  const linesRootError = errors.lines?.root?.message ?? errors.lines?.message;
  const lineCount = fields.length;
  const showBulkPasteEditor =
    isBulkPasteExpanded ||
    lineCount === 0 ||
    bulkText.trim().length > 0 ||
    bulkIssues.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa định mức món bán" : "Tạo định mức món bán"}
          </DialogTitle>
          <DialogDescription>
            Lượng nguyên liệu cho 1 phần món trên menu (khác công thức sản xuất).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onValid)}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="space-y-2">
            <Label className="text-sm font-medium">Món bán *</Label>
            <Controller
              control={form.control}
              name="menu_item_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isEdit}
                >
                  <SelectTrigger
                    className={cn(errors.menu_item_id && "border-destructive")}
                    aria-invalid={!!errors.menu_item_id}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    <SelectValue placeholder="Chọn món bán..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMenuItems.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        Tất cả món bán đã có định mức.
                      </div>
                    ) : (
                      availableMenuItems.map((mi) => (
                        <SelectItem key={mi.id} value={String(mi.id)}>
                          {mi.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.menu_item_id && (
              <p className="text-xs text-destructive" role="alert">
                {errors.menu_item_id.message}
              </p>
            )}
          </div>

          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="recipe-bulk-paste"
                className="text-sm font-medium"
              >
                Dán danh sách nguyên liệu
              </Label>
              {lineCount > 0 && !showBulkPasteEditor ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkPasteExpanded(true)}
                >
                  <IconClipboardPaste data-icon="inline-start" />
                  Dán thêm
                </Button>
              ) : null}
            </div>

            {showBulkPasteEditor ? (
              <>
                <Textarea
                  id="recipe-bulk-paste"
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  placeholder={"Gạo tấm thơm 0,18 kg\nSườn cốt lết 0,16 kg"}
                  className="mt-2"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="mt-3 w-full"
                  onClick={handleApplyPastedLines}
                  disabled={!bulkText.trim()}
                >
                  Áp dụng danh sách
                </Button>
                {bulkIssues.length > 0 ? (
                  <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                    <div className="font-medium">
                      {bulkIssues.length} dòng cần kiểm tra
                    </div>
                    <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                      {bulkIssues.slice(0, 4).map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                    {bulkIssues.length > 4 ? (
                      <div className="mt-1">
                        Còn {bulkIssues.length - 4} dòng khác.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-2 rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                Đã nhập {lineCount} nguyên liệu. Dán thêm khi cần bổ sung hoặc
                cập nhật số lượng.
              </div>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <Label className="text-sm font-medium">
                  Thêm nhanh nguyên liệu
                </Label>
                <span className="text-xs text-muted-foreground">
                  {alreadySelectedIngredientIds.size} nguyên liệu đã chọn
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <MultiSelectCombobox
                  options={ingredients.map((ing) => ({
                    value: String(ing.id),
                    label: ing.name,
                    hint: ing.unit,
                    alreadySelected: alreadySelectedIngredientIds.has(
                      String(ing.id),
                    ),
                  }))}
                  onConfirm={handleBulkAddIngredients}
                  triggerLabel="Chọn nhiều nguyên liệu"
                  confirmLabel={(n) =>
                    n > 0 ? `Thêm ${n} nguyên liệu` : "Thêm nguyên liệu"
                  }
                  searchPlaceholder="Tìm theo tên..."
                  triggerClassName="w-full sm:w-auto"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => append(EMPTY_ROW)}
                >
                  <IconPlus className="size-4" />
                  Thêm dòng trống
                </Button>
              </div>
            </div>
          </div>

          <div className={cn("space-y-2", lineCount > 0 && "sm:pb-24")}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-sm font-medium">
                  Danh sách nguyên liệu *
                </Label>
                <span className="text-xs text-muted-foreground">
                  {lineCount} nguyên liệu trong lần lưu này
                </span>
              </div>
              <Badge variant="outline">Định mức</Badge>
            </div>

            <div className="flex flex-col gap-3">
              {fields.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Dán danh sách, chọn nhiều nguyên liệu hoặc thêm dòng trống để
                  bắt đầu định mức.
                </div>
              ) : (
                fields.map((row, index) => (
                  <RecipeLineEditor
                    key={row.id}
                    form={form}
                    index={index}
                    ingredients={ingredients}
                    line={watchedLines[index] ?? EMPTY_ROW}
                    onRemove={() => remove(index)}
                    onIngredientChange={handleIngredientChangeFactory(index)}
                  />
                ))
              )}
            </div>

            {linesRootError ? (
              <p className="text-sm text-destructive" role="alert">
                {linesRootError}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Yield mặc định 1.0 (không hao hụt). 0.85 = hao 15% khi chế biến.
            </p>
          </div>

          {serverError ? (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          ) : null}

          {lineCount > 0 ? (
            <DialogFooter className="flex-col border-t bg-popover pt-3 sm:sticky sm:bottom-0 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                size="touch"
                className="w-full sm:w-auto"
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                size="touch"
                className="w-full sm:w-auto"
              >
                {isPending && <Spinner data-icon="inline-start" />}
                {isEdit ? "Cập nhật định mức" : `Lưu định mức (${lineCount})`}
              </Button>
            </DialogFooter>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
