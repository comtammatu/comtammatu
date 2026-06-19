"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing inventory ingredient form keeps operational copy inline until message-catalog extraction */

import { useMemo } from "react";
import { z } from "zod";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  FormDialog,
  MoneyVndField,
  NumberField,
  QuantityField,
  SelectField,
  TextField,
} from "@/components/form";
import { createIngredient, updateIngredient } from "../ingredient-actions";
import type { IngredientRow } from "../_lib/types";
import { STORAGE_OPTIONS, ITEM_KIND_OPTIONS } from "../_lib/constants";
import { parseOptionalNumber } from "../_lib/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";

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
  purchase_to_measure_factor: z
    .string()
    .trim()
    .min(1, { error: "Tỉ lệ quy đổi không được để trống" })
    .refine(
      (value) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0;
      },
      { error: "Tỉ lệ quy đổi phải lớn hơn 0" },
    ),
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

function toFormValues(ingredient: IngredientRow | null): IngredientFormValues {
  return {
    name: ingredient?.name ?? "",
    purchase_unit: ingredient?.purchase_unit ?? ingredient?.unit ?? "",
    measure_unit: ingredient?.measure_unit ?? ingredient?.unit ?? "",
    purchase_to_measure_factor:
      ingredient?.purchase_to_measure_factor != null
        ? String(ingredient.purchase_to_measure_factor)
        : "1",
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

interface IngredientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredient: IngredientRow | null;
  onSaved: () => void | Promise<void>;
}

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  onSaved,
}: IngredientDialogProps) {
  const isEdit = ingredient !== null;
  const defaultValues = useMemo(() => toFormValues(ingredient), [ingredient]);

  async function handleSubmit(values: IngredientFormValues) {
    const payload = {
      name: values.name,
      purchase_unit: values.purchase_unit,
      measure_unit: values.measure_unit,
      purchase_to_measure_factor:
        parseOptionalNumber(values.purchase_to_measure_factor) ?? 1,
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

    try {
      const result =
        isEdit && ingredient
          ? await updateIngredient(ingredient.id, payload)
          : await createIngredient({
              name: payload.name,
              purchase_unit: payload.purchase_unit,
              measure_unit: payload.measure_unit,
              purchase_to_measure_factor: payload.purchase_to_measure_factor,
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

      if (result.success) {
        try {
          await onSaved();
        } catch {
          toast.error("Đã lưu nhưng chưa tải lại được danh sách nguyên liệu.");
        }
      }
      return result;
    } catch {
      return {
        success: false,
        error: "Không thể lưu nguyên liệu. Vui lòng thử lại.",
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
      title={isEdit ? "Chỉnh sửa nguyên liệu" : "Thêm nguyên liệu mới"}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      successMessage={
        isEdit ? "Đã cập nhật nguyên liệu" : "Đã thêm nguyên liệu mới"
      }
      contentClassName="sm:max-w-lg"
      onSubmit={handleSubmit}
    >
      {(form) => (
        <>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              control={form.control}
              name="name"
              label="Tên nguyên liệu"
              placeholder="VD: Sườn cốt lết"
              required
            />
            <TextField
              control={form.control}
              name="purchase_unit"
              label="Đơn vị nhập"
              placeholder="thùng, bao, chai..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <TextField
              control={form.control}
              name="measure_unit"
              label="Đơn vị tính"
              placeholder="kg, ml, cái..."
              required
            />
            <TextField
              control={form.control}
              name="sku"
              label="Mã SKU"
              placeholder="SKU-001"
            />
          </div>

          <NumberField
            control={form.control}
            name="purchase_to_measure_factor"
            label="Tỉ lệ quy đổi"
            description="Số đơn vị tính trong 1 đơn vị nhập. VD: 1 chai = 250 ml thì nhập 250."
            maxFractionDigits={6}
            placeholder="VD: 250"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <TextField
              control={form.control}
              name="category"
              label="Danh mục"
              placeholder="Thịt, Rau củ..."
            />
            <MoneyVndField
              control={form.control}
              name="unit_cost"
              label="Giá nhập tham chiếu (VND)"
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              control={form.control}
              name="storage_type"
              label="Kiểu lưu trữ"
              options={STORAGE_OPTIONS}
            />
            <SelectField
              control={form.control}
              name="item_kind"
              label="Loại hàng"
              options={ITEM_KIND_OPTIONS}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <QuantityField
              control={form.control}
              name="min_stock_level"
              label="Tồn tối thiểu"
              maxFractionDigits={2}
            />
            <QuantityField
              control={form.control}
              name="max_stock_level"
              label="Tồn tối đa"
              maxFractionDigits={2}
            />
            <QuantityField
              control={form.control}
              name="reorder_point"
              label="Điểm đặt hàng"
              maxFractionDigits={2}
            />
          </div>

          <NumberField
            control={form.control}
            name="shelf_life_days"
            label="Hạn sử dụng (ngày)"
            maxFractionDigits={0}
            placeholder="VD: 7"
          />
        </>
      )}
    </FormDialog>
  );
}
