"use client";

import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import { Save as IconSave } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormDialog, QuantityField, QuantityInput } from "@/components/form";
import { messages } from "@lib/messages";
import { bulkUpdateIngredientThresholds } from "./actions";

const copy = messages.inventory.settings.thresholds;

const bulkThresholdSchema = z.object({
  min: z.string(),
  reorder: z.string(),
  max: z.string(),
});

type BulkThresholdValues = z.infer<typeof bulkThresholdSchema>;

const BULK_THRESHOLD_DEFAULT_VALUES: BulkThresholdValues = {
  min: "",
  reorder: "",
  max: "",
};

export type ThresholdRow = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  purchaseUnit: string | null;
  minStock: string;
  reorderPoint: string;
  maxStock: string;
};

type FieldKey = "minStock" | "reorderPoint" | "maxStock";

type EditableRow = ThresholdRow & {
  initialMin: string;
  initialReorder: string;
  initialMax: string;
};

function toNumOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function rowIsDirty(row: EditableRow): boolean {
  return (
    row.minStock !== row.initialMin ||
    row.reorderPoint !== row.initialReorder ||
    row.maxStock !== row.initialMax
  );
}

function rowError(row: EditableRow): string | null {
  const min = toNumOrNull(row.minStock);
  const reorder = toNumOrNull(row.reorderPoint);
  const max = toNumOrNull(row.maxStock);
  if (min != null && reorder != null && min > reorder) {
    return "Tồn tối thiểu > Điểm đặt lại";
  }
  if (reorder != null && max != null && reorder > max) {
    return "Điểm đặt lại > Tồn tối đa";
  }
  if (min != null && max != null && min > max) {
    return "Tồn tối thiểu > Tồn tối đa";
  }
  return null;
}

export function ThresholdsClient({ rows }: { rows: ThresholdRow[] }) {
  const [editable, setEditable] = useState<EditableRow[]>(() =>
    rows.map((r) => ({
      ...r,
      initialMin: r.minStock,
      initialReorder: r.reorderPoint,
      initialMax: r.maxStock,
    })),
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirtyRows = useMemo(() => editable.filter(rowIsDirty), [editable]);
  const dirtyCount = dirtyRows.length;
  const errorCount = useMemo(
    () => editable.filter((r) => rowError(r) != null).length,
    [editable],
  );

  function patchRow(id: number, key: FieldKey, value: string) {
    setEditable((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  }

  function toggleRow(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(editable.map((r) => r.id)) : new Set());
  }

  function handleBulkApply(values: {
    min: string;
    reorder: string;
    max: string;
  }) {
    setEditable((prev) =>
      prev.map((r) => {
        if (!selected.has(r.id)) return r;
        return {
          ...r,
          minStock: values.min !== "" ? values.min : r.minStock,
          reorderPoint: values.reorder !== "" ? values.reorder : r.reorderPoint,
          maxStock: values.max !== "" ? values.max : r.maxStock,
        };
      }),
    );
    setBulkOpen(false);
  }

  function handleSave() {
    if (dirtyCount === 0) {
      toast.info(copy.save.nothing);
      return;
    }
    if (errorCount > 0) {
      toast.error(copy.save.failed);
      return;
    }
    const updates = dirtyRows.map((r) => {
      const minChanged = r.minStock !== r.initialMin;
      const reorderChanged = r.reorderPoint !== r.initialReorder;
      const maxChanged = r.maxStock !== r.initialMax;
      const item: {
        id: number;
        min_stock_level?: number;
        reorder_point?: number | null;
        max_stock_level?: number | null;
      } = { id: r.id };
      if (minChanged) {
        const v = toNumOrNull(r.minStock);
        if (v != null) item.min_stock_level = v;
      }
      if (reorderChanged) {
        item.reorder_point = toNumOrNull(r.reorderPoint);
      }
      if (maxChanged) {
        item.max_stock_level = toNumOrNull(r.maxStock);
      }
      return item;
    });

    startTransition(async () => {
      const res = await bulkUpdateIngredientThresholds({ updates });
      if (!res.success) {
        toast.error(res.error ?? copy.save.failed);
        return;
      }
      const data = res.data as { updated: number };
      toast.success(copy.save.success(data.updated));
      // Roll initial state forward so dirty-tracking resets without
      // a router refresh (rows already reflect the saved values).
      setEditable((prev) =>
        prev.map((r) => ({
          ...r,
          initialMin: r.minStock,
          initialReorder: r.reorderPoint,
          initialMax: r.maxStock,
        })),
      );
      setSelected(new Set());
    });
  }

  const allSelected = editable.length > 0 && selected.size === editable.length;
  const someSelected = selected.size > 0 && !allSelected;
  const columns: DataTableColumn<EditableRow>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(value) => toggleAll(value === true)}
          aria-label={copy.selectAllAria}
        />
      ),
      className: "w-10",
      render: (row) => (
        <Checkbox
          checked={selected.has(row.id)}
          onCheckedChange={(value) => toggleRow(row.id, value === true)}
          aria-label={`Chọn ${row.name}`}
        />
      ),
    },
    {
      key: "ingredient",
      header: copy.cols.ingredient,
      render: (row) => {
        const error = rowError(row);
        return (
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {row.sku ?? "—"}
              {error ? (
                <span className="ml-2 text-destructive" role="alert">
                  · {error}
                </span>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      key: "unit",
      header: copy.cols.unit,
      className: "w-28 text-xs text-muted-foreground",
      render: (row) => row.unit,
    },
    {
      key: "min",
      header: copy.cols.min,
      className: "w-32 text-right",
      render: (row) => (
        <QuantityInput
          value={row.minStock}
          onValueChange={(value) => patchRow(row.id, "minStock", value)}
          maxFractionDigits={3}
          placeholder="0"
          className="h-8 text-right tabular-nums"
          aria-label={`${copy.cols.min} ${row.name}`}
        />
      ),
    },
    {
      key: "reorder",
      header: copy.cols.reorder,
      className: "w-32 text-right",
      render: (row) => (
        <QuantityInput
          value={row.reorderPoint}
          onValueChange={(value) => patchRow(row.id, "reorderPoint", value)}
          maxFractionDigits={3}
          placeholder="—"
          className="h-8 text-right tabular-nums"
          aria-label={`${copy.cols.reorder} ${row.name}`}
        />
      ),
    },
    {
      key: "max",
      header: copy.cols.max,
      className: "w-32 text-right",
      render: (row) => (
        <QuantityInput
          value={row.maxStock}
          onValueChange={(value) => patchRow(row.id, "maxStock", value)}
          maxFractionDigits={3}
          placeholder="—"
          className="h-8 text-right tabular-nums"
          aria-label={`${copy.cols.max} ${row.name}`}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{copy.hint}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={selected.size === 0}
          onClick={() => setBulkOpen(true)}
        >
          {copy.bulk.applyTo(selected.size)}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={editable}
        getRowKey={(row) => row.id}
        emptyTitle="Chưa có nguyên liệu cần cấu hình ngưỡng"
        emptyMode="no-data"
        rowClassName={(row) =>
          rowIsDirty(row)
            ? rowError(row)
              ? "bg-destructive/10"
              : "bg-warning/5"
            : rowError(row)
              ? "bg-destructive/10"
              : undefined
        }
        mobileCardRender={(row) => (
          <ThresholdItem
            row={row}
            selected={selected.has(row.id)}
            onSelectedChange={(checked) => toggleRow(row.id, checked)}
            onPatch={(key, value) => patchRow(row.id, key, value)}
          />
        )}
      />

      <div className="sticky bottom-0 flex items-center justify-between border-t bg-card/95 px-4 py-3 backdrop-blur">
        <span className="text-xs text-muted-foreground">
          {dirtyCount > 0
            ? copy.dirtySummary(dirtyCount, errorCount)
            : copy.save.nothing}
        </span>
        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending || dirtyCount === 0 || errorCount > 0}
          size="lg"
        >
          {isPending ? (
            <Spinner className="mr-2" />
          ) : (
            <IconSave className="size-4" />
          )}
          {copy.save.action(dirtyCount)}
        </Button>
      </div>

      <BulkApplyDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        selectedCount={selected.size}
        onApply={handleBulkApply}
      />
    </div>
  );
}

function ThresholdItem({
  row,
  selected,
  onSelectedChange,
  onPatch,
}: {
  row: EditableRow;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
  onPatch: (key: FieldKey, value: string) => void;
}) {
  const error = rowError(row);
  const dirty = rowIsDirty(row);

  return (
    <Item
      variant="outline"
      className={
        error ? "bg-destructive/10" : dirty ? "bg-warning/5" : undefined
      }
    >
      <ItemHeader>
        <div>
          <ItemTitle>{row.name}</ItemTitle>
          <ItemDescription>
            {row.sku ?? "—"} · {row.unit}
            {error ? (
              <span className="ml-2 text-destructive" role="alert">
                · {error}
              </span>
            ) : null}
          </ItemDescription>
        </div>
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          aria-label={`Chọn ${row.name}`}
        />
      </ItemHeader>
      <ItemContent className="basis-full">
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{copy.cols.min}</span>
            <QuantityInput
              value={row.minStock}
              onValueChange={(value) => onPatch("minStock", value)}
              maxFractionDigits={3}
              placeholder="0"
              className="h-8 text-right tabular-nums"
              aria-label={`${copy.cols.min} ${row.name}`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{copy.cols.reorder}</span>
            <QuantityInput
              value={row.reorderPoint}
              onValueChange={(value) => onPatch("reorderPoint", value)}
              maxFractionDigits={3}
              placeholder="—"
              className="h-8 text-right tabular-nums"
              aria-label={`${copy.cols.reorder} ${row.name}`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{copy.cols.max}</span>
            <QuantityInput
              value={row.maxStock}
              onValueChange={(value) => onPatch("maxStock", value)}
              maxFractionDigits={3}
              placeholder="—"
              className="h-8 text-right tabular-nums"
              aria-label={`${copy.cols.max} ${row.name}`}
            />
          </label>
        </div>
      </ItemContent>
    </Item>
  );
}

function BulkApplyDialog({
  open,
  onOpenChange,
  selectedCount,
  onApply,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  selectedCount: number;
  onApply: (values: { min: string; reorder: string; max: string }) => void;
}) {
  async function handleSubmit(values: BulkThresholdValues) {
    if (selectedCount === 0) {
      return { success: false, error: copy.bulk.empty };
    }
    if (values.min === "" && values.reorder === "" && values.max === "") {
      return {
        success: false,
        error: "Nhập ít nhất một ngưỡng để áp dụng.",
      };
    }

    onApply(values);
    return { success: true };
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.bulk.dialogTitle}
      description={`${copy.bulk.applyTo(selectedCount)} · ${copy.bulk.dialogHint}`}
      schema={bulkThresholdSchema}
      defaultValues={BULK_THRESHOLD_DEFAULT_VALUES}
      entityKey={`bulk-${selectedCount}`}
      onSubmit={handleSubmit}
      successMessage={copy.bulk.applyTo(selectedCount)}
      submitLabel={copy.bulk.applyAction}
      cancelLabel={copy.bulk.cancel}
      contentClassName="sm:max-w-md"
    >
      {(form) => (
        <div className="grid grid-cols-3 gap-3">
          <QuantityField
            control={form.control}
            name="min"
            label={copy.cols.min}
            placeholder="—"
            className="h-9 text-right tabular-nums"
          />
          <QuantityField
            control={form.control}
            name="reorder"
            label={copy.cols.reorder}
            placeholder="—"
            className="h-9 text-right tabular-nums"
          />
          <QuantityField
            control={form.control}
            name="max"
            label={copy.cols.max}
            placeholder="—"
            className="h-9 text-right tabular-nums"
          />
        </div>
      )}
    </FormDialog>
  );
}
