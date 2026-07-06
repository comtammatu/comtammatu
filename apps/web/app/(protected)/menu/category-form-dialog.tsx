"use client";

import { z } from "zod";
import {
  FormDialog,
  SelectField,
  TextField,
  NumberField,
  valuesToFormData,
} from "@/components/form";
import { ACTIONS_VI, MENU_VI } from "@comtammatu/shared/messages";
import { createCategory, updateCategory } from "./actions";
import { CATEGORY_TYPE_LABELS } from "./category-labels";
import type { CategoryRow } from "./category-table";

const categoryTypeValues = Object.keys(CATEGORY_TYPE_LABELS) as [
  keyof typeof CATEGORY_TYPE_LABELS,
  ...Array<keyof typeof CATEGORY_TYPE_LABELS>,
];

const categorySchema = z.object({
  name: z.string().trim().min(1, { error: MENU_VI.categoryNameRequired }),
  type: z.enum(categoryTypeValues, { error: MENU_VI.categoryTypeInvalid }),
  sort_order: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

const CATEGORY_TYPE_OPTIONS = Object.entries(CATEGORY_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

function toFormValues(
  category: CategoryRow | null | undefined,
): CategoryFormValues {
  return {
    name: category?.name ?? "",
    type:
      (category?.type as (typeof categoryTypeValues)[number] | undefined) ??
      categoryTypeValues[0],
    sort_order:
      category?.sort_order != null ? String(category.sort_order) : "0",
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
      title={isEdit ? MENU_VI.editCategoryTitle : MENU_VI.addCategoryTitle}
      successMessage={isEdit ? MENU_VI.categoryUpdated : MENU_VI.categoryCreated}
      submitLabel={isEdit ? ACTIONS_VI.update : ACTIONS_VI.create}
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
            label={MENU_VI.categoryNameLabel}
            placeholder={MENU_VI.categoryNamePlaceholder}
            required
          />
          <SelectField
            control={form.control}
            name="type"
            label="Loại"
            options={CATEGORY_TYPE_OPTIONS}
            placeholder={MENU_VI.selectTypePlaceholder}
            required
          />
          <NumberField
            control={form.control}
            name="sort_order"
            label={MENU_VI.sortOrderLabel}
            allowNegative={false}
          />
        </>
      )}
    </FormDialog>
  );
}
