"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Combobox } from "@/components/form";
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
import { upsertRecipeLines } from "../procurement-actions";

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
  ingredient_id: z
    .string()
    .min(1, { error: "Chọn nguyên liệu" }),
  quantity: z
    .string()
    .min(1, { error: "Nhập số lượng" })
    .refine((v) => Number(v) > 0, { error: "Số lượng phải > 0" }),
  unit: z.string().trim().min(1, { error: "Đơn vị không được trống" }),
  yield_factor: z
    .string()
    .min(1, { error: "Nhập yield" })
    .refine((v) => Number(v) > 0, { error: "Yield phải > 0" }),
  note: z.string().optional(),
});

const recipeSchema = z.object({
  menu_item_id: z
    .string()
    .min(1, { error: "Vui lòng chọn thành phẩm" }),
  lines: z
    .array(recipeLineRowSchema)
    .min(1, { error: "Công thức phải có ít nhất 1 nguyên liệu" })
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

/* ─── Row ─── */

function LineRowCells({
  control,
  index,
  ingredients,
  errors,
  onRemove,
  canRemove,
  onIngredientChange,
}: {
  control: Control<RecipeFormValues>;
  index: number;
  ingredients: IngredientOption[];
  errors: FieldErrors<RecipeFormValues>;
  onRemove: () => void;
  canRemove: boolean;
  onIngredientChange: (ingredientId: string) => void;
}) {
  const rowError = errors.lines?.[index];

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto] items-center gap-2 px-3 py-2">
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
                "h-9",
                rowError?.ingredient_id && "border-destructive",
              )}
            />
          )}
        />

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
              className={cn("h-9", rowError?.quantity && "border-destructive")}
            />
          )}
        />

        <Controller
          control={control}
          name={`lines.${index}.unit`}
          render={({ field }) => (
            <Input
              placeholder="kg, lít..."
              {...field}
              value={field.value ?? ""}
              aria-invalid={!!rowError?.unit}
              className={cn("h-9", rowError?.unit && "border-destructive")}
            />
          )}
        />

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
              className={cn("h-9", rowError?.yield_factor && "border-destructive")}
            />
          )}
        />

        <Controller
          control={control}
          name={`lines.${index}.note`}
          render={({ field }) => (
            <Input
              placeholder="Tùy chọn"
              {...field}
              value={field.value ?? ""}
              className="h-9"
            />
          )}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="Xoá dòng"
        >
          <Trash2 className="size-4 text-muted-foreground" />
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

  const initialValues = useMemo<RecipeFormValues>(
    () => ({
      menu_item_id: editingMenuItemId ? String(editingMenuItemId) : "",
      lines:
        editingLines && editingLines.length > 0
          ? editingLines.map((l) => ({
              ingredient_id: String(l.ingredientId),
              quantity: String(l.quantity),
              unit: l.unit,
              yield_factor: String(l.yieldFactor),
              note: l.note ?? "",
            }))
          : [EMPTY_ROW],
    }),
    [editingMenuItemId, editingLines],
  );

  const form = useForm<RecipeFormValues, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: initialValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  useEffect(() => {
    if (open) {
      form.reset(initialValues);
      setServerError(null);
    }
  }, [open, initialValues, form]);

  const availableMenuItems = useMemo(() => {
    if (isEdit) return menuItems;
    const blocked = new Set(existingMenuItemIds);
    return menuItems.filter((mi) => !blocked.has(mi.id));
  }, [menuItems, existingMenuItemIds, isEdit]);

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
        setServerError(result.error ?? "Đã xảy ra lỗi");
        return;
      }
      toast.success(
        isEdit
          ? `Đã cập nhật công thức (${parsedLines.length} nguyên liệu)`
          : `Đã tạo công thức (${parsedLines.length} nguyên liệu)`,
      );
      onOpenChange(false);
      onSaved();
    });
  }

  const errors = form.formState.errors;
  const linesRootError = errors.lines?.root?.message ?? errors.lines?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa công thức" : "Tạo công thức thành phẩm"}
          </DialogTitle>
          <DialogDescription>
            Công thức là định mức nguyên liệu để Bếp trung tâm sản xuất 1 phần
            thành phẩm. Mỗi thành phẩm có thể gồm nhiều nguyên liệu.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onValid)} noValidate className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Thành phẩm *</Label>
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
                    className={cn(
                      "h-10",
                      errors.menu_item_id && "border-destructive",
                    )}
                    aria-invalid={!!errors.menu_item_id}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    <SelectValue placeholder="Chọn thành phẩm..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMenuItems.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        Tất cả thành phẩm đã có công thức.
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Danh sách nguyên liệu *
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(EMPTY_ROW)}
              >
                <Plus className="size-4" />
                Thêm nguyên liệu
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <div>Nguyên liệu</div>
                <div>Số lượng</div>
                <div>Đơn vị</div>
                <div>Yield</div>
                <div>Ghi chú</div>
                <div className="w-8" />
              </div>

              <div className="divide-y">
                {fields.map((row, index) => (
                  <LineRowCells
                    key={row.id}
                    control={form.control}
                    index={index}
                    ingredients={ingredients}
                    errors={errors}
                    onRemove={() => remove(index)}
                    canRemove={fields.length > 1}
                    onIngredientChange={handleIngredientChangeFactory(index)}
                  />
                ))}
              </div>
            </div>

            {linesRootError && (
              <p className="text-sm text-destructive" role="alert">
                {linesRootError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Yield mặc định 1.0 (không hao hụt). 0.85 = hao 15% khi chế biến.
            </p>
          </div>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-10"
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending} className="h-10">
              {isPending && <Spinner className="mr-2" />}
              {isEdit ? "Cập nhật công thức" : "Lưu công thức"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
