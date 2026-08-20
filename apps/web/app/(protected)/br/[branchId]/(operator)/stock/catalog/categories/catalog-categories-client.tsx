"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@/components/confirm-dialog";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { FormSheet, NumberField, TextField } from "@/components/form";
import { messages } from "@lib/messages";
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryRow,
} from "@/(protected)/inventory/settings/categories/categories-actions";
import {
  CatalogList,
  CATALOG_DELETE_ICON,
  CATALOG_EDIT_ICON,
} from "../catalog-list";

const copy = messages.catalog.categories;
const formCopy = messages.inventoryMaster.categories;

const categoryFormSchema = z.object({
  name: z.string().trim().min(1),
  sort_order: z.coerce.number().int().min(0),
  is_active: z.boolean(),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const NEW_CATEGORY_DEFAULTS: CategoryFormValues = {
  name: "",
  sort_order: 0,
  is_active: true,
};

export function CatalogCategoriesClient({ rows }: { rows: CategoryRow[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<CategoryRow | null>(null);
  const [, startDelete] = useTransition();

  function openCreate() {
    setEditRow(null);
    setDialogOpen(true);
  }

  function openEdit(row: CategoryRow) {
    setEditRow(row);
    setDialogOpen(true);
  }

  async function handleSubmit(values: CategoryFormValues) {
    const result = editRow
      ? await updateCategory({ id: editRow.id, ...values })
      : await createCategory(values);
    if (result.success) router.refresh();
    return result;
  }

  async function handleDelete(row: CategoryRow) {
    const ok = await confirm({
      title: formCopy.delete.title,
      description: formCopy.delete.description(row.name),
      confirmText: formCopy.delete.confirm,
      cancelText: formCopy.delete.cancel,
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      const res = await deleteCategory({ id: row.id });
      if (!res.success) {
        toast.error(res.error ?? formCopy.delete.failed);
        return;
      }
      toast.success(formCopy.delete.success);
      router.refresh();
    });
  }

  const defaultValues: CategoryFormValues = editRow
    ? {
        name: editRow.name,
        sort_order: editRow.sort_order,
        is_active: editRow.is_active,
      }
    : NEW_CATEGORY_DEFAULTS;

  return (
    <div className="flex flex-col gap-3">
      <CatalogList
        rows={rows}
        getRowKey={(row) => row.id}
        renderPrimary={(row) => row.name}
        emptyTitle={copy.empty}
        addLabel={copy.add}
        onAdd={openCreate}
        actions={[
          {
            key: "edit",
            icon: CATALOG_EDIT_ICON,
            ariaLabel: (row) => copy.editAria(row.name),
            onSelect: openEdit,
          },
          {
            key: "delete",
            icon: CATALOG_DELETE_ICON,
            ariaLabel: (row) => copy.deleteAria(row.name),
            onSelect: handleDelete,
          },
        ]}
      />

      <FormSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editRow ? formCopy.form.editTitle : formCopy.form.addTitle}
        schema={categoryFormSchema}
        defaultValues={defaultValues}
        entityKey={editRow ? editRow.id : "new"}
        onSubmit={handleSubmit}
        successMessage={
          editRow ? formCopy.form.editSuccess : formCopy.form.addSuccess
        }
        submitLabel={formCopy.form.save}
        cancelLabel={formCopy.form.cancel}
        contentClassName="sm:max-w-md"
      >
        {(form) => (
          <>
            <TextField
              control={form.control}
              name="name"
              label={formCopy.form.name}
              placeholder={formCopy.form.namePlaceholder}
              required
            />
            <NumberField
              control={form.control}
              name="sort_order"
              label={formCopy.form.sortOrder}
              maxFractionDigits={0}
              placeholder="0"
            />
            <Field orientation="horizontal">
              <FieldLabel htmlFor="catalog-category-is-active">
                {formCopy.form.isActive}
              </FieldLabel>
              <Switch
                id="catalog-category-is-active"
                checked={form.watch("is_active")}
                onCheckedChange={(checked) =>
                  form.setValue("is_active", checked)
                }
              />
            </Field>
          </>
        )}
      </FormSheet>
    </div>
  );
}
