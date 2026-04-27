"use client";

import { Controller } from "react-hook-form";
import { z } from "zod";
import {
  FormDialog,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
  valuesToFormData,
} from "@/components/form";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { createItem, updateItem } from "./actions";
import { MenuImageInput } from "./menu-image-input";
import type { CategoryRow } from "./category-table";
import type { ItemRow } from "./item-table";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
const itemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Tên món không được trống" })
    .max(100, { error: "Tên món tối đa 100 ký tự" }),
  category_id: z.string().min(1, { error: "Vui lòng chọn danh mục" }),
  base_price: z
    .string()
    .trim()
    .min(1, { error: "Giá không được trống" })
    .refine((v) => Number(v) >= 0, { error: "Giá không hợp lệ" }),
  description: z
    .string()
    .max(500, { error: "Mô tả tối đa 500 ký tự" })
    .optional(),
  image_url: z.string().nullable().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

function toFormValues(item: ItemRow | null | undefined): ItemFormValues {
  return {
    name: item?.name ?? "",
    category_id: item?.category_id != null ? String(item.category_id) : "",
    base_price: item?.base_price != null ? String(item.base_price) : "",
    description: item?.description ?? "",
    image_url: item?.image_url ?? null,
  };
}

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemRow | null;
  categories: CategoryRow[];
  tenantId: number;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  categories,
  tenantId,
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
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
      onSubmit={async (values) => {
        const fd = valuesToFormData(values);
        // valuesToFormData skips null/empty — set explicitly so server can clear it.
        fd.set("image_url", values.image_url ?? "");
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
          <NumberField
            control={form.control}
            name="base_price"
            label="Giá gốc (VND)"
            maxFractionDigits={0}
            placeholder="35.000"
            required
          />
          <TextareaField
            control={form.control}
            name="description"
            label="Mô tả"
            rows={2}
            placeholder="Mô tả ngắn về món ăn"
          />
          <Controller
            control={form.control}
            name="image_url"
            render={({ field }) => (
              <Field>
                <FieldLabel>Ảnh món</FieldLabel>
                <MenuImageInput
                  tenantId={tenantId}
                  value={field.value ?? null}
                  onChange={(url) => field.onChange(url)}
                />
              </Field>
            )}
          />
        </>
      )}
    </FormDialog>
  );
}
