"use client";

import { z } from "zod";
import {
  FormDialog,
  SelectField,
  TextField,
  TextareaField,
  valuesToFormData,
} from "@/components/form";
import { createItem, updateItem } from "./actions";
import type { CategoryRow } from "./category-table";
import type { ItemRow } from "./item-table";

const itemSchema = z.object({
  name: z.string().trim().min(1, { error: "Tên món không được trống" }),
  category_id: z.string().min(1, { error: "Vui lòng chọn danh mục" }),
  base_price: z
    .string()
    .trim()
    .min(1, { error: "Giá không được trống" })
    .refine((v) => Number(v) >= 0, { error: "Giá không hợp lệ" }),
  description: z.string().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

function toFormValues(item: ItemRow | null | undefined): ItemFormValues {
  return {
    name: item?.name ?? "",
    category_id: item?.category_id != null ? String(item.category_id) : "",
    base_price: item?.base_price != null ? String(item.base_price) : "",
    description: item?.description ?? "",
  };
}

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemRow | null;
  categories: CategoryRow[];
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  categories,
}: ItemFormDialogProps) {
  const isEdit = !!item;
  const activeCategories = categories.filter(
    (c) => c.is_active || c.id === item?.category_id,
  );

  const categoryOptions = activeCategories.map((cat) => ({
    value: cat.id.toString(),
    label: cat.name,
  }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={itemSchema}
      defaultValues={toFormValues(item)}
      entityKey={item?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa món" : "Thêm món mới"}
      successMessage={isEdit ? "Đã cập nhật món" : "Đã tạo món mới"}
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
      onSubmit={async (values) => {
        const fd = valuesToFormData(values);
        if (isEdit && item) {
          fd.set("id", String(item.id));
          return updateItem(null, fd);
        }
        return createItem(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label="Tên món"
            placeholder="VD: Cơm sườn cốt lết"
            required
          />
          <SelectField
            control={form.control}
            name="category_id"
            label="Danh mục"
            options={categoryOptions}
            placeholder="Chọn danh mục"
            required
          />
          <TextField
            control={form.control}
            name="base_price"
            label="Giá gốc (VND)"
            type="number"
            min={0}
            step={1000}
            placeholder="35000"
            required
          />
          <TextareaField
            control={form.control}
            name="description"
            label="Mô tả"
            rows={2}
            placeholder="Mô tả ngắn về món ăn"
          />
        </>
      )}
    </FormDialog>
  );
}
