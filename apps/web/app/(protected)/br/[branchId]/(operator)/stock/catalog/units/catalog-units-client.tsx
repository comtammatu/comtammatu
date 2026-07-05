"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  PauseCircle as IconPause,
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash2 as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { FormDialog, TextField } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  createUnit,
  deleteUnit,
  updateUnit,
  type UnitRow,
} from "@/(protected)/inventory/settings/units/units-actions";
import { CatalogBackHeader } from "../catalog-back-header";

const copy = messages.catalog.units;
const formCopy = messages.inventoryMaster.units;

const unitFormSchema = z.object({
  code: z.string().trim().min(1),
  is_active: z.boolean(),
});

type UnitFormValues = z.infer<typeof unitFormSchema>;

const NEW_UNIT_DEFAULTS: UnitFormValues = {
  code: "",
  is_active: true,
};

export function CatalogUnitsClient({
  backHref,
  rows,
}: {
  backHref: string;
  rows: UnitRow[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<UnitRow | null>(null);
  const [, startMutation] = useTransition();

  // Standard units are system-managed (fixed factors); only packaging units
  // are editable here, matching the office units screen.
  // Active packaging units only: standard units are system-managed, and
  // inactive units would render a permanently-disabled deactivate control.
  const packagingRows = rows.filter((row) => !row.is_standard && row.is_active);

  function openCreate() {
    setEditRow(null);
    setDialogOpen(true);
  }

  function openEdit(row: UnitRow) {
    setEditRow(row);
    setDialogOpen(true);
  }

  async function handleSubmit(values: UnitFormValues) {
    const result = editRow
      ? await updateUnit({ id: editRow.id, ...values })
      : await createUnit(values);
    if (result.success) router.refresh();
    return result;
  }

  function handleDeactivate(row: UnitRow) {
    startMutation(async () => {
      const res = await updateUnit({
        id: row.id,
        code: row.code,
        is_active: false,
      });
      if (!res.success) {
        toast.error(res.error ?? formCopy.deactivate.failed);
        return;
      }
      toast.success(formCopy.deactivate.success);
      router.refresh();
    });
  }

  async function handleDelete(row: UnitRow) {
    const ok = await confirm({
      title: formCopy.delete.title,
      description: formCopy.delete.description(row.name),
      confirmText: formCopy.delete.confirm,
      cancelText: formCopy.delete.cancel,
      variant: "destructive",
    });
    if (!ok) return;
    startMutation(async () => {
      const res = await deleteUnit({ id: row.id });
      if (!res.success) {
        toast.error(res.error ?? formCopy.delete.failed);
        return;
      }
      toast.success(formCopy.delete.success);
      router.refresh();
    });
  }

  const defaultValues: UnitFormValues = editRow
    ? { code: editRow.code, is_active: editRow.is_active }
    : NEW_UNIT_DEFAULTS;

  return (
    <div className="flex flex-col gap-3">
      <CatalogBackHeader title={copy.title} backHref={backHref} />

      {packagingRows.length === 0 ? (
        <AppEmptyState compact title={copy.empty} />
      ) : (
        <div className="flex flex-col gap-2">
          {packagingRows.map((row) => (
            <Item key={row.id} variant="outline" size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle className="truncate font-mono text-sm font-medium">
                  {row.code}
                </ItemTitle>
                {row.inUse ? (
                  <div>
                    <Badge variant="outline">{copy.inUse}</Badge>
                  </div>
                ) : null}
              </ItemContent>
              <ItemActions className="shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  aria-label={copy.editAria(row.code)}
                  onClick={() => openEdit(row)}
                >
                  <IconPencil className="size-4" />
                </Button>
                {row.inUse ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={!row.is_active}
                    aria-label={copy.deactivateAria(row.code)}
                    onClick={() => handleDeactivate(row)}
                  >
                    <IconPause className="size-4 text-warning" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    aria-label={copy.deleteAria(row.code)}
                    onClick={() => handleDelete(row)}
                  >
                    <IconTrash className="size-4 text-destructive" />
                  </Button>
                )}
              </ItemActions>
            </Item>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="touch"
        onClick={openCreate}
        className="w-full border-dashed"
      >
        <IconPlus data-icon="inline-start" />
        {copy.add}
      </Button>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editRow ? formCopy.form.editTitle : formCopy.form.addTitle}
        schema={unitFormSchema}
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
              name="code"
              label={formCopy.form.code}
              placeholder={formCopy.form.codePlaceholder}
              required
            />
            <Field orientation="horizontal">
              <FieldLabel htmlFor="catalog-unit-is-active">
                {formCopy.form.isActive}
              </FieldLabel>
              <Switch
                id="catalog-unit-is-active"
                checked={form.watch("is_active")}
                onCheckedChange={(checked) =>
                  form.setValue("is_active", checked)
                }
              />
            </Field>
          </>
        )}
      </FormDialog>
    </div>
  );
}
