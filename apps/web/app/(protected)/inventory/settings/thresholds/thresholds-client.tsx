"use client";

import { useMemo, useState, useTransition } from "react";
import { Save as IconSave } from "lucide-react";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormDialog, QuantityField, QuantityInput } from "@/components/form";
import {
  AppDetailFooter,
  AppListFrame,
  AppToolbar,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { bulkUpdateIngredientThresholds } from "./actions";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
const copy = messages.inventory.settings.thresholds;
const ariaSelectRowPrefix = "Chọn ";
const invalidThresholdLabel = "Ngưỡng tồn phải là số không âm.";

const bulkThresholdSchema = z.object({
  min: z
    .string()
    .trim()
    .min(1, { error: invalidThresholdLabel })
    .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, {
      error: invalidThresholdLabel,
    }),
});

type BulkThresholdValues = z.infer<typeof bulkThresholdSchema>;

export type ThresholdRow = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  minStock: string;
};

type EditableRow = ThresholdRow & { initialMin: string };

function minValue(row: EditableRow): number | null {
  const value = Number(row.minStock.trim());
  return row.minStock.trim() !== "" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rowIsDirty(row: EditableRow): boolean {
  return row.minStock !== row.initialMin;
}

export function ThresholdsClient({ rows }: { rows: ThresholdRow[] }) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const [editable, setEditable] = useState<EditableRow[]>(() =>
    rows.map((row) => ({ ...row, initialMin: row.minStock })),
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirtyRows = useMemo(() => editable.filter(rowIsDirty), [editable]);
  const invalidCount = dirtyRows.filter((row) => minValue(row) == null).length;

  function patchRow(id: number, value: string) {
    setEditable((current) =>
      current.map((row) => (row.id === id ? { ...row, minStock: value } : row)),
    );
  }

  function toggleRow(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleSave() {
    if (dirtyRows.length === 0) {
      toast.info(copy.save.nothing);
      return;
    }
    if (invalidCount > 0) {
      toast.error(invalidThresholdLabel);
      return;
    }

    startTransition(async () => {
      const result = await bulkUpdateIngredientThresholds({
        updates: dirtyRows.map((row) => ({
          id: row.id,
          min_stock_level: minValue(row) as number,
        })),
      });
      if (!result.success) {
        toast.error(result.error ?? copy.save.failed);
        return;
      }
      const data = result.data as { updated: number };
      toast.success(copy.save.success(data.updated));
      setEditable((current) =>
        current.map((row) => ({ ...row, initialMin: row.minStock })),
      );
      setSelected(new Set());
    });
  }

  const allSelected = editable.length > 0 && selected.size === editable.length;
  const columns: DataTableColumn<EditableRow>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={
            allSelected ? true : selected.size > 0 ? "indeterminate" : false
          }
          onCheckedChange={(value) =>
            setSelected(
              value === true
                ? new Set(editable.map((row) => row.id))
                : new Set(),
            )
          }
          aria-label={copy.selectAllAria}
        />
      ),
      className: "w-10",
      render: (row) => (
        <Checkbox
          checked={selected.has(row.id)}
          onCheckedChange={(value) => toggleRow(row.id, value === true)}
          aria-label={`${ariaSelectRowPrefix}${row.name}`}
        />
      ),
    },
    {
      key: "ingredient",
      header: copy.cols.ingredient,
      sortable: true,
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {row.sku ?? "—"}
          </div>
        </div>
      ),
    },
    {
      key: "unit",
      header: copy.cols.unit,
      className: "w-28 text-xs text-muted-foreground",
      sortable: true,
      sortValue: (row) => row.unit,
      render: (row) => row.unit,
    },
    {
      key: "min",
      header: copy.cols.min,
      className: "w-40 text-right",
      render: (row) => (
        <QuantityInput
          value={row.minStock}
          onValueChange={(value) => patchRow(row.id, value)}
          maxFractionDigits={3}
          placeholder="0"
          className="h-8 text-right tabular-nums"
          aria-label={`${copy.cols.min} ${row.name}`}
        />
      ),
    },
  ];

  return (
    <>
    <AppListFrame
      toolbar={
        <AppToolbar variant="inline" className="justify-between">
          <span className="text-xs text-muted-foreground">{copy.hint}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={() => setBulkOpen(true)}
          >
            {copy.bulk.applyTo(selected.size)}
          </Button>
        </AppToolbar>
      }
    >
      <DataTable
        columns={columns}
        data={editable}
        getRowKey={(row) => row.id}
        emptyTitle={copy.empty}
        emptyMode="no-data"
        rowClassName={(row) =>
          rowIsDirty(row)
            ? minValue(row) == null
              ? "bg-destructive/10"
              : "bg-warning/10"
            : undefined
        }
        mobileCardRender={(row) => (
          <Item
            variant="outline"
            className={rowIsDirty(row) ? "bg-warning/10" : undefined}
          >
            <ItemHeader>
              <div>
                <ItemTitle>{row.name}</ItemTitle>
                <ItemDescription>
                  {row.sku ?? "—"} · {row.unit}
                </ItemDescription>
              </div>
              <Checkbox
                size={isTouchLayout ? "touch" : "default"}
                checked={selected.has(row.id)}
                onCheckedChange={(value) => toggleRow(row.id, value === true)}
                aria-label={`${ariaSelectRowPrefix}${row.name}`}
              />
            </ItemHeader>
            <ItemContent className="basis-full">
              <QuantityInput
                value={row.minStock}
                onValueChange={(value) => patchRow(row.id, value)}
                maxFractionDigits={3}
                placeholder="0"
                className="h-12 text-right tabular-nums lg:h-10"
                aria-label={`${copy.cols.min} ${row.name}`}
              />
            </ItemContent>
          </Item>
        )}
        pageSize={25}
      />

      <AppDetailFooter
        sticky
        className="bg-card/95 px-4 py-3 backdrop-blur"
        leading={
          <span className="text-xs text-muted-foreground">
            {copy.dirtySummary(dirtyRows.length, invalidCount)}
          </span>
        }
        trailing={
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || dirtyRows.length === 0 || invalidCount > 0}
            size="lg"
          >
            {isPending ? (
              <Spinner className="mr-2" />
            ) : (
              <IconSave className="size-4" />
            )}
            {copy.save.action(dirtyRows.length)}
          </Button>
        }
      />
    </AppListFrame>

      <FormDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={copy.bulk.dialogTitle}
        description={`${copy.bulk.applyTo(selected.size)} · ${copy.bulk.dialogHint}`}
        schema={bulkThresholdSchema}
        defaultValues={{ min: "" }}
        entityKey={`bulk-${selected.size}`}
        onSubmit={async (values: BulkThresholdValues) => {
          setEditable((current) =>
            current.map((row) =>
              selected.has(row.id) ? { ...row, minStock: values.min } : row,
            ),
          );
          setBulkOpen(false);
          return { success: true };
        }}
        successMessage={copy.bulk.applyTo(selected.size)}
        submitLabel={copy.bulk.applyAction}
        cancelLabel={copy.bulk.cancel}
        contentClassName="sm:max-w-md"
      >
        {(form) => (
          <QuantityField
            control={form.control}
            name="min"
            label={copy.cols.min}
            placeholder="0"
            className="h-12 text-right tabular-nums lg:h-10"
          />
        )}
      </FormDialog>
    </>
  );
}
