"use client";

import { z } from "zod";
import { FormDialog, SelectField, TextField, valuesToFormData } from "@/components/form";
import { createCategory, updateCategory } from "./actions";
import { CATEGORY_TYPE_LABELS } from "./category-labels";
import type { CategoryRow } from "./category-table";

const categoryTypeValues = Object.keys(CATEGORY_TYPE_LABELS) as [
  keyof typeof CATEGORY_TYPE_LABELS,
  ...Array<keyof typeof CATEGORY_TYPE_LABELS>,
];

const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Tên danh mục không được trống" }),
  type: z.enum(categoryTypeValues, { error: "Loại danh mục không hợp lệ" }),
  sort_order: z.string().optional(),
  kitchen_printer: z.enum(["1", "2"], { error: "Chọn bếp in" }),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

const CATEGORY_TYPE_OPTIONS = Object.entries(CATEGORY_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const KITCHEN_PRINTER_OPTIONS = [
  { value: "1", label: "Bếp 1 (Món chính)" },
  { value: "2", label: "Bếp 2 (Nước / Tráng miệng)" },
];

function toFormValues(category: CategoryRow | null | undefined): CategoryFormValues {
  return {
    name: category?.name ?? "",
    type:
      (category?.type as (typeof categoryTypeValues)[number] | undefined) ??
      categoryTypeValues[0],
    sort_order: category?.sort_order != null ? String(category.sort_order) : "0",
    kitchen_printer: category?.kitchen_printer === 2 ? "2" : "1",
  };
}

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryRow | null;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: CategoryFormDialogProps) {
  const isEdit = !!category;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={categorySchema}
      defaultValues={toFormValues(category)}
      entityKey={category?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
      successMessage={isEdit ? "Đã cập nhật danh mục" : "Đã tạo danh mục mới"}
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
      onSubmit={async (values) => {
        const fd = valuesToFormData(values);
        if (isEdit && category) {
          fd.set("id", String(category.id));
          return updateCategory(null, fd);
        }
        return createCategory(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label="Tên danh mục"
            placeholder="VD: Cơm tấm, Nước uống"
            required
          />
          <SelectField
            control={form.control}
            name="type"
            label="Loại"
            options={CATEGORY_TYPE_OPTIONS}
            placeholder="Chọn loại"
            required
          />
          <SelectField
            control={form.control}
            name="kitchen_printer"
            label="Bếp in"
            options={KITCHEN_PRINTER_OPTIONS}
            placeholder="Chọn bếp in"
            required
          />
          <TextField
            control={form.control}
            name="sort_order"
            label="Thứ tự hiển thị"
            type="number"
            min={0}
          />
        </>
      )}
    </FormDialog>
  );
}
