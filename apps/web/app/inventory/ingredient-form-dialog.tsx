"use client";

import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "./_components/formatted-number-input";
import { createIngredient, updateIngredient } from "./actions";
import type { IngredientRow } from "./page";

/* ─── Schema ─── */

const ingredientSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên nguyên liệu không được trống" }),
  purchase_unit: z
    .string()
    .trim()
    .min(1, { error: "Đơn vị nhập không được trống" }),
  measure_unit: z
    .string()
    .trim()
    .min(1, { error: "Đơn vị tính không được trống" }),
  sku: z.string().trim().optional(),
  category: z.string().trim().optional(),
  unit_cost: z.string().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]),
  storage_type: z.enum(["ambient", "refrigerated", "frozen"]),
  min_stock_level: z.string().optional(),
  max_stock_level: z.string().optional(),
  reorder_point: z.string().optional(),
  shelf_life_days: z.string().optional(),
});

type IngredientFormValues = z.infer<typeof ingredientSchema>;

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toFormValues(ingredient: IngredientRow | null): IngredientFormValues {
  return {
    name: ingredient?.name ?? "",
    purchase_unit: ingredient?.purchase_unit ?? ingredient?.unit ?? "",
    measure_unit: ingredient?.measure_unit ?? ingredient?.unit ?? "",
    sku: ingredient?.sku ?? "",
    category: ingredient?.category ?? "",
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
  };
}

/* ─── Component ─── */

interface IngredientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientRow | null;
  onSaved: (saved: IngredientRow) => void;
}

function IngredientFormContent({
  open,
  ingredient,
  onOpenChange,
  onSaved,
}: IngredientFormDialogProps) {
  const isEdit = ingredient !== null;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: toFormValues(ingredient),
  });

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(ingredient));
      setServerError(null);
    }
  }, [open, ingredient, form]);

  function onValid(values: IngredientFormValues) {
    startTransition(async () => {
      setServerError(null);

      const payload = {
        name: values.name,
        purchase_unit: values.purchase_unit,
        measure_unit: values.measure_unit,
        sku: values.sku || undefined,
        category: values.category || undefined,
        unit_cost: parseOptionalNumber(values.unit_cost),
        item_kind: values.item_kind,
        storage_type: values.storage_type,
        min_stock_level: parseOptionalNumber(values.min_stock_level),
        max_stock_level: parseOptionalNumber(values.max_stock_level),
        reorder_point: parseOptionalNumber(values.reorder_point),
        shelf_life_days: parseOptionalNumber(values.shelf_life_days),
      };

      if (isEdit) {
        const result = await updateIngredient(ingredient.id, payload);
        if (!result.success) {
          setServerError(result.error ?? "Đã xảy ra lỗi");
          return;
        }
        toast.success("Đã cập nhật nguyên liệu");
        onSaved({
          ...ingredient,
          name: payload.name,
          unit: payload.measure_unit,
          purchase_unit: payload.purchase_unit,
          measure_unit: payload.measure_unit,
          sku: payload.sku ?? null,
          unit_cost: payload.unit_cost ?? null,
          category: payload.category ?? null,
          item_kind: payload.item_kind,
          storage_type: payload.storage_type,
          min_stock_level:
            payload.min_stock_level ?? ingredient.min_stock_level,
          max_stock_level: payload.max_stock_level ?? null,
          reorder_point: payload.reorder_point ?? null,
          shelf_life_days: payload.shelf_life_days ?? null,
        });
      } else {
        const result = await createIngredient({
          name: payload.name,
          purchase_unit: payload.purchase_unit,
          measure_unit: payload.measure_unit,
          sku: payload.sku,
          unit_cost: payload.unit_cost,
          category: payload.category,
          item_kind: payload.item_kind,
          storage_type: payload.storage_type,
          min_stock_level: payload.min_stock_level ?? 0,
          max_stock_level: payload.max_stock_level,
          reorder_point: payload.reorder_point,
          shelf_life_days: payload.shelf_life_days,
        });
        if (!result.success) {
          setServerError(result.error ?? "Đã xảy ra lỗi");
          return;
        }
        toast.success("Đã thêm nguyên liệu mới");
        const newId = (result.data as { id: number } | null)?.id ?? 0;
        onSaved({
          id: newId,
          name: payload.name,
          unit: payload.measure_unit,
          purchase_unit: payload.purchase_unit,
          measure_unit: payload.measure_unit,
          sku: payload.sku ?? null,
          unit_cost: payload.unit_cost ?? null,
          category: payload.category ?? null,
          item_kind: payload.item_kind,
          storage_type: payload.storage_type,
          min_stock_level: payload.min_stock_level ?? 0,
          max_stock_level: payload.max_stock_level ?? null,
          reorder_point: payload.reorder_point ?? null,
          shelf_life_days: payload.shelf_life_days ?? null,
          is_active: true,
        });
      }
      onOpenChange(false);
    });
  }

  const errors = form.formState.errors;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Chỉnh sửa nguyên liệu" : "Thêm nguyên liệu mới"}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(onValid)} noValidate>
        <FieldGroup>
          {/* Row 1: name + purchase unit */}
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="ing-name">Tên nguyên liệu *</FieldLabel>
              <Input
                id="ing-name"
                placeholder="VD: Sườn cốt lết"
                aria-invalid={!!errors.name}
                className="h-10"
                {...form.register("name")}
              />
              <FieldError errors={errors.name ? [errors.name] : undefined} />
            </Field>
            <Field data-invalid={!!errors.purchase_unit}>
              <FieldLabel htmlFor="ing-purchase-unit">Đơn vị nhập *</FieldLabel>
              <Input
                id="ing-purchase-unit"
                placeholder="thùng, bao, chai..."
                aria-invalid={!!errors.purchase_unit}
                className="h-10"
                {...form.register("purchase_unit")}
              />
              <FieldError
                errors={
                  errors.purchase_unit ? [errors.purchase_unit] : undefined
                }
              />
            </Field>
          </div>

          {/* Row 2: measure unit + sku */}
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.measure_unit}>
              <FieldLabel htmlFor="ing-measure-unit">Đơn vị tính *</FieldLabel>
              <Input
                id="ing-measure-unit"
                placeholder="kg, ml, cái..."
                aria-invalid={!!errors.measure_unit}
                className="h-10"
                {...form.register("measure_unit")}
              />
              <FieldError
                errors={errors.measure_unit ? [errors.measure_unit] : undefined}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-sku">Mã SKU</FieldLabel>
              <Input
                id="ing-sku"
                placeholder="SKU-001"
                className="h-10"
                {...form.register("sku")}
              />
            </Field>
          </div>

          {/* Row 3: category + unit_cost */}
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="ing-category">Danh mục</FieldLabel>
              <Input
                id="ing-category"
                placeholder="Thịt, Rau củ..."
                className="h-10"
                {...form.register("category")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-unit-cost">
                Giá nhập tham chiếu (VND)
              </FieldLabel>
              <Controller
                name="unit_cost"
                control={form.control}
                render={({ field }) => (
                  <FormattedNumberInput
                    id="ing-unit-cost"
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    maxFractionDigits={0}
                    placeholder="0"
                    className="h-10"
                  />
                )}
              />
            </Field>
          </div>

          {/* Row 4: storage + kind */}
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="ing-storage">Kiểu lưu trữ</FieldLabel>
              <Controller
                name="storage_type"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ing-storage" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ambient">Thường</SelectItem>
                      <SelectItem value="refrigerated">Lạnh</SelectItem>
                      <SelectItem value="frozen">Đông lạnh</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-kind">Loại hàng</FieldLabel>
              <Controller
                name="item_kind"
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ing-kind" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw_material">Nguyên liệu</SelectItem>
                      <SelectItem value="finished_good">Thành phẩm</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          {/* Row 5: min / max / reorder */}
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel htmlFor="ing-min">Tồn tối thiểu</FieldLabel>
              <Controller
                name="min_stock_level"
                control={form.control}
                render={({ field }) => (
                  <FormattedNumberInput
                    id="ing-min"
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    maxFractionDigits={2}
                    className="h-10"
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-max">Tồn tối đa</FieldLabel>
              <Controller
                name="max_stock_level"
                control={form.control}
                render={({ field }) => (
                  <FormattedNumberInput
                    id="ing-max"
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    maxFractionDigits={2}
                    className="h-10"
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-reorder">Điểm đặt hàng</FieldLabel>
              <Controller
                name="reorder_point"
                control={form.control}
                render={({ field }) => (
                  <FormattedNumberInput
                    id="ing-reorder"
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    maxFractionDigits={2}
                    className="h-10"
                  />
                )}
              />
            </Field>
          </div>

          {/* shelf_life_days */}
          <Field>
            <FieldLabel htmlFor="ing-shelf">Hạn sử dụng (ngày)</FieldLabel>
            <Controller
              name="shelf_life_days"
              control={form.control}
              render={({ field }) => (
                <FormattedNumberInput
                  id="ing-shelf"
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  maxFractionDigits={0}
                  placeholder="VD: 7"
                  className="h-10"
                />
              )}
            />
          </Field>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}
        </FieldGroup>

        <DialogFooter className="pt-6">
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
            {isEdit ? "Cập nhật" : "Tạo mới"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function IngredientFormDialog({
  open,
  onOpenChange,
  ingredient,
  onSaved,
}: IngredientFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        key={ingredient?.id ?? "new-ingredient"}
      >
        <IngredientFormContent
          open={open}
          ingredient={ingredient}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
