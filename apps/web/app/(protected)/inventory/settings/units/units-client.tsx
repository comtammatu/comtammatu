"use client";

import { useMemo, useState, useTransition } from "react";
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
  AppSection,
  AppToolbar,
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
import { FormDialog, TextField } from "@/components/form";
import { messages } from "@lib/messages";
import { FORM_VI } from "@comtammatu/shared/messages";
import {
  createUnit,
  deleteUnit,
  updateUnit,
  type UnitDimension,
  type UnitRow,
} from "./units-actions";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
const copy = messages.inventoryMaster.units;

const unitFormSchema = z.object({
  code: z.string().trim().min(1),
  is_active: z.boolean(),
});

type UnitFormValues = z.infer<typeof unitFormSchema>;

const NEW_UNIT_DEFAULTS: UnitFormValues = {
  code: "",
  is_active: true,
};

const STANDARD_DIMENSION_ORDER: UnitDimension[] = ["mass", "volume"];

const STANDARD_DIMENSION_LABEL: Record<UnitDimension, string> = {
  mass: copy.standard.mass,
  volume: copy.standard.volume,
};

export function UnitsClient({ rows }: { rows: UnitRow[] }) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<UnitRow | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [, startMutation] = useTransition();

  const standardByDimension = useMemo(() => {
    const grouped = new Map<UnitDimension, UnitRow[]>();
    for (const dimension of STANDARD_DIMENSION_ORDER)
      grouped.set(dimension, []);
    for (const row of rows) {
      if (!row.is_standard || row.dimension === null) continue;
      grouped.get(row.dimension)?.push(row);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => (a.standard_factor ?? 0) - (b.standard_factor ?? 0));
    }
    return grouped;
  }, [rows]);

  const packagingRows = useMemo(
    () =>
      rows.filter((row) => !row.is_standard && (showInactive || row.is_active)),
    [rows, showInactive],
  );

  function openCreate() {
    setEditRow(null);
    setDialogOpen(true);
  }

  function openEdit(row: UnitRow) {
    if (row.inUse) return;
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

  async function handleDeactivate(row: UnitRow) {
    startMutation(async () => {
      const res = await updateUnit({
        id: row.id,
        code: row.code,
        is_active: false,
      });
      if (!res.success) {
        toast.error(res.error ?? copy.deactivate.failed);
        return;
      }
      toast.success(copy.deactivate.success);
      router.refresh();
    });
  }

  async function handleDelete(row: UnitRow) {
    const ok = await confirm({
      title: copy.delete.title,
      description: copy.delete.description(row.name),
      confirmText: copy.delete.confirm,
      cancelText: copy.delete.cancel,
      variant: "destructive",
    });
    if (!ok) return;
    startMutation(async () => {
      const res = await deleteUnit({ id: row.id });
      if (!res.success) {
        toast.error(res.error ?? copy.delete.failed);
        return;
      }
      toast.success(copy.delete.success);
      router.refresh();
    });
  }

  const defaultValues: UnitFormValues = editRow
    ? {
        code: editRow.code,
        is_active: editRow.is_active,
      }
    : NEW_UNIT_DEFAULTS;

  function StatusBadges({ row }: { row: UnitRow }) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? copy.status.active : copy.status.inactive}
        </Badge>
        {row.inUse ? (
          <Badge variant="outline">{copy.status.inUse}</Badge>
        ) : null}
      </div>
    );
  }

  function getUnitRowActions(row: UnitRow): RowActionItem[] {
    const items: RowActionItem[] = [];
    if (!row.inUse) {
      items.push({
        key: "edit",
        label: copy.edit,
        icon: <IconPencil />,
        onSelect: () => openEdit(row),
      });
      items.push({
        key: "delete",
        label: copy.delete.action,
        icon: <IconTrash />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          void handleDelete(row);
        },
      });
      return items;
    }
    items.push({
      key: "deactivate",
      label: copy.deactivate.action,
      icon: <IconPause />,
      disabled: !row.is_active,
      onSelect: () => {
        void handleDeactivate(row);
      },
    });
    return items;
  }

  const columns: DataTableColumn<UnitRow>[] = [
    {
      key: "code",
      header: copy.cols.code,
      className: "font-mono font-medium",
      sortable: true,
      sortValue: (row) => row.code,
      render: (row) => row.code,
    },
    {
      key: "status",
      header: copy.cols.status,
      className: "w-56",
      render: (row) => <StatusBadges row={row} />,
    },
    {
      key: "actions",
      header: FORM_VI.action,
      className: "w-14",
      render: (row) => {
        const items = getUnitRowActions(row);
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
    <div className="flex flex-col gap-4">
      <AppSection
        title={copy.standard.title}
        description={copy.standard.description}
        contentFlush
      >
        <div className="flex flex-col divide-y divide-border/60">
          {STANDARD_DIMENSION_ORDER.map((dimension) => {
            const dimensionRows = standardByDimension.get(dimension) ?? [];
            if (dimensionRows.length === 0) return null;
            return (
              <div key={dimension} className="flex flex-col gap-2 px-4 py-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {STANDARD_DIMENSION_LABEL[dimension]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {dimensionRows.map((row) => (
                    <div
                      key={row.id}
                      className="inline-flex items-center gap-2"
                    >
                      <Badge
                        variant="outline"
                        className="h-auto gap-2 px-3 py-1.5 text-xs"
                      >
                        <span className="font-mono font-semibold">
                          {row.code}
                        </span>
                        <span className="font-normal text-muted-foreground">
                          {copy.standard.factor(
                            `${row.standard_factor ?? 1} ${
                              dimension === "mass" ? "g" : "ml"
                            }`,
                          )}
                        </span>
                      </Badge>
                      {row.inUse ? (
                        <Badge variant="outline">{copy.status.inUse}</Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </AppSection>

      <AppListFrame
        title={copy.packaging.title}
        description={copy.packaging.description}
        toolbar={
          <AppToolbar
            variant="inline"
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Field orientation="horizontal" className="w-auto">
                  <FieldLabel htmlFor="units-show-inactive">
                    {copy.showInactive}
                  </FieldLabel>
                  <Switch
                    id="units-show-inactive"
                    checked={showInactive}
                    onCheckedChange={setShowInactive}
                  />
                </Field>
                <Button size="lg" onClick={openCreate}>
                  <IconPlus data-icon="inline-start" />
                  {copy.add}
                </Button>
              </div>
            }
          />
        }
      >
        <DataTable
          columns={columns}
          data={packagingRows}
          getRowKey={(row) => row.id}
          onRowClick={(row) => {
            if (!row.inUse) openEdit(row);
          }}
          renderRowContextMenu={(row) => (
            <RowActionsContextMenuItems items={getUnitRowActions(row)} />
          )}
          emptyTitle={copy.emptyPackaging}
          emptyMode="no-data"
          mobileCardRender={(row) => (
            <Item
              variant="outline"
              onClick={() => {
                if (!row.inUse) openEdit(row);
              }}
            >
              <ItemContent className="min-w-0">
                <ItemTitle size="heading" className="font-mono">
                  {row.code}
                </ItemTitle>
                <ItemDescription className="text-sm leading-6">
                  <StatusBadges row={row} />
                </ItemDescription>
              </ItemContent>
              <ItemActions className="self-center">
                <div onClick={(event) => event.stopPropagation()}>
                  <RowActionsMenu
                    items={getUnitRowActions(row)}
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
        schema={unitFormSchema}
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
              name="code"
              label={copy.form.code}
              placeholder={copy.form.codePlaceholder}
              required
            />
            <Field orientation="horizontal">
              <FieldLabel htmlFor="unit-is-active">
                {copy.form.isActive}
              </FieldLabel>
              <Switch
                id="unit-is-active"
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
