"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: existing inventory stock adjustment form keeps operational copy inline */

import { z } from "zod";
import {
  FormDialog,
  NumberField,
  SelectField,
  TextareaField,
} from "@/components/form";
import { adjustStock } from "../stock-actions";

const ADJUST_TYPE_OPTIONS = [
  { value: "adjustment", label: "Điều chỉnh thủ công" },
  { value: "count_adjustment", label: "Kiểm kho" },
] as const;

const adjustStockSchema = z.object({
  adjust_type: z.enum(["adjustment", "count_adjustment"]),
  quantity_change: z
    .string()
    .trim()
    .min(1, { error: "Số lượng điều chỉnh không được trống" })
    .refine(
      (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n !== 0;
      },
      { error: "Số lượng điều chỉnh không được bằng 0" },
    ),
  reason: z.string().trim().optional(),
});

type AdjustStockFormValues = z.infer<typeof adjustStockSchema>;

const DEFAULT_VALUES: AdjustStockFormValues = {
  adjust_type: "adjustment",
  quantity_change: "",
  reason: "",
};

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  onAdjusted: () => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  branchId,
  ingredientId,
  ingredientName,
  unit,
  onAdjusted,
}: AdjustStockDialogProps) {
  async function handleSubmit(values: AdjustStockFormValues) {
    const parsedQuantityChange = Number(values.quantity_change);
    const result = await adjustStock({
      branchId,
      ingredientId,
      quantityChange: parsedQuantityChange,
      type: values.adjust_type,
      reason: values.reason || undefined,
    });
    if (result.success) {
      onAdjusted();
    }
    return result;
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={adjustStockSchema}
      defaultValues={DEFAULT_VALUES}
      entityKey={`adjust-${ingredientId}`}
      title="Điều chỉnh tồn kho"
      description={`Nguyên liệu: ${ingredientName}`}
      submitLabel="Xác nhận"
      successMessage={`Đã điều chỉnh tồn kho ${ingredientName}`}
      contentClassName="sm:max-w-sm"
      onSubmit={handleSubmit}
    >
      {(form) => (
        <>
          <SelectField
            control={form.control}
            name="adjust_type"
            label="Loại điều chỉnh"
            options={ADJUST_TYPE_OPTIONS}
          />

          <NumberField
            control={form.control}
            name="quantity_change"
            label={`Số lượng (${unit}) - dương = nhập, âm = xuất`}
            allowNegative
            maxFractionDigits={2}
            placeholder="VD: 10 hoặc -5"
            required
          />

          <TextareaField
            control={form.control}
            name="reason"
            label="Lý do (tùy chọn)"
            placeholder="VD: Nhập hàng sáng, Hao hụt..."
            rows={3}
          />
        </>
      )}
    </FormDialog>
  );
}
