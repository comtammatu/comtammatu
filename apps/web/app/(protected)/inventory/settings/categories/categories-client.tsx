"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash2 as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import {
  AppListFrame,
  AppPageHeader,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { FormDialog, NumberField, TextField } from "@/components/form";
import { messages } from "@lib/messages";
import { FORM_VI } from "@comtammatu/shared/messages";
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryRow,
} from "./categories-actions";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
const copy = messages.inventoryMaster.categories;

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

export function CategoriesClient({ rows }: { rows: CategoryRow[] }) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

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
      title: copy.delete.title,
      description: copy.delete.description(row.name),
      confirmText: copy.delete.confirm,
      cancelText: copy.delete.cancel,
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      const res = await deleteCategory({ id: row.id });
      if (!res.success) {
        toast.error(res.error ?? copy.delete.failed);
        return;
      }
      toast.success(copy.delete.success);
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

  function getCategoryRowActions(row: CategoryRow): RowActionItem[] {
    return [
      {
        key: "edit",
        label: copy.edit,
        icon: <IconPencil />,
        onSelect: () => openEdit(row),
      },
      {
        key: "delete",
        label: copy.delete.action,
        icon: <IconTrash />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          void handleDelete(row);
        },
      },
    ];
  }

  const columns: DataTableColumn<CategoryRow>[] = [
    {
      key: "name",
      header: copy.cols.name,
      className: "font-medium",
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => row.name,
    },
    {
      key: "sort_order",
      header: copy.cols.sortOrder,
      className: "w-24 text-right font-mono tabular-nums",
      sortable: true,
      sortValue: (row) => row.sort_order,
      render: (row) => row.sort_order,
    },
    {
      key: "status",
      header: copy.cols.status,
      className: "w-32 text-center",
      sortable: true,
      sortValue: (row) => (row.is_active ? "1" : "0"),
      render: (row) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? copy.status.active : copy.status.inactive}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: FORM_VI.action,
      className: "w-14",
      render: (row) => {
        const items = getCategoryRowActions(row);
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={FORM_VI.action}
              triggerSize="icon-sm"
            />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <AppPageHeader
        title={copy.page.title}
        actions={
          <Button size="lg" onClick={openCreate}>
            <IconPlus data-icon="inline-start" />
            {copy.add}
          </Button>
        }
      />

      <AppListFrame>
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          onRowClick={openEdit}
          renderRowContextMenu={(row) => (
            <RowActionsContextMenuItems items={getCategoryRowActions(row)} />
          )}
          emptyTitle={copy.empty}
          emptyMode="no-data"
          mobileCardRender={(row) => (
            <Item variant="outline" onClick={() => openEdit(row)}>
              <ItemContent className="min-w-0">
                <ItemTitle size="heading">{row.name}</ItemTitle>
                <ItemDescription className="text-sm leading-6">
                  {copy.cols.sortOrder}: {row.sort_order}
                </ItemDescription>
                <div>
                  <Badge variant={row.is_active ? "success" : "secondary"}>
                    {row.is_active ? copy.status.active : copy.status.inactive}
                  </Badge>
                </div>
              </ItemContent>
              <ItemActions className="self-center">
                <div onClick={(event) => event.stopPropagation()}>
                  <RowActionsMenu
                    items={getCategoryRowActions(row)}
                    label={FORM_VI.action}
                    triggerSize={isTouchLayout ? "icon-touch" : "icon"}
                  />
                </div>
              </ItemActions>
            </Item>
          )}
        />
      </AppListFrame>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editRow ? copy.form.editTitle : copy.form.addTitle}
        schema={categoryFormSchema}
        defaultValues={defaultValues}
        entityKey={editRow ? editRow.id : "new"}
        onSubmit={handleSubmit}
        successMessage={editRow ? copy.form.editSuccess : copy.form.addSuccess}
        submitLabel={copy.form.save}
        cancelLabel={copy.form.cancel}
        contentClassName="sm:max-w-md"
      >
        {(form) => (
          <>
            <TextField
              control={form.control}
              name="name"
              label={copy.form.name}
              placeholder={copy.form.namePlaceholder}
              required
            />
            <NumberField
              control={form.control}
              name="sort_order"
              label={copy.form.sortOrder}
              maxFractionDigits={0}
              placeholder="0"
            />
            <Field orientation="horizontal">
              <FieldLabel htmlFor="category-is-active">
                {copy.form.isActive}
              </FieldLabel>
              <Switch
                id="category-is-active"
                checked={form.watch("is_active")}
                onCheckedChange={(checked) =>
                  form.setValue("is_active", checked)
                }
              />
            </Field>
          </>
        )}
      </FormDialog>
    </>
  );
}
