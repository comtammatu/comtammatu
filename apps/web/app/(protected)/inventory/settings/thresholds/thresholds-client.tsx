"use client";

import { useMemo, useState, useTransition } from "react";
import { Save as IconSave } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { QuantityInput } from "@/components/form";
import { messages } from "@lib/messages";
import { bulkUpdateIngredientThresholds } from "./actions";

const copy = messages.inventory.settings.thresholds;

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                onCheckedChange={(v) => toggleAll(v === true)}
                aria-label={copy.selectAllAria}
              />
            </TableHead>
            <TableHead>{copy.cols.ingredient}</TableHead>
            <TableHead className="w-28">{copy.cols.unit}</TableHead>
            <TableHead className="w-32 text-right">{copy.cols.min}</TableHead>
            <TableHead className="w-32 text-right">
              {copy.cols.reorder}
            </TableHead>
            <TableHead className="w-32 text-right">{copy.cols.max}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {editable.map((row) => {
            const error = rowError(row);
            const dirty = rowIsDirty(row);
            return (
              <TableRow
                key={row.id}
                data-dirty={dirty || undefined}
                data-invalid={error != null || undefined}
                className="data-[dirty]:bg-warning/5 data-[invalid]:bg-destructive/10"
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={(v) => toggleRow(row.id, v === true)}
                    aria-label={`Chọn ${row.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.sku ?? "—"}
                    {error ? (
                      <span className="ml-2 text-destructive" role="alert">
                        · {error}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.unit}
                </TableCell>
                <TableCell className="text-right">
                  <QuantityInput
                    value={row.minStock}
                    onValueChange={(v) => patchRow(row.id, "minStock", v)}
                    maxFractionDigits={3}
                    placeholder="0"
                    className="h-8 text-right tabular-nums"
                    aria-label={`${copy.cols.min} ${row.name}`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <QuantityInput
                    value={row.reorderPoint}
                    onValueChange={(v) => patchRow(row.id, "reorderPoint", v)}
                    maxFractionDigits={3}
                    placeholder="—"
                    className="h-8 text-right tabular-nums"
                    aria-label={`${copy.cols.reorder} ${row.name}`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <QuantityInput
                    value={row.maxStock}
                    onValueChange={(v) => patchRow(row.id, "maxStock", v)}
                    maxFractionDigits={3}
                    placeholder="—"
                    className="h-8 text-right tabular-nums"
                    aria-label={`${copy.cols.max} ${row.name}`}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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
  const [min, setMin] = useState("");
  const [reorder, setReorder] = useState("");
  const [max, setMax] = useState("");

  function reset() {
    setMin("");
    setReorder("");
    setMax("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.bulk.dialogTitle}</DialogTitle>
          <DialogDescription>
            {copy.bulk.applyTo(selectedCount)} · {copy.bulk.dialogHint}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{copy.cols.min}</span>
            <QuantityInput
              value={min}
              onValueChange={setMin}
              maxFractionDigits={3}
              placeholder="—"
              className="h-9 text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{copy.cols.reorder}</span>
            <QuantityInput
              value={reorder}
              onValueChange={setReorder}
              maxFractionDigits={3}
              placeholder="—"
              className="h-9 text-right tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{copy.cols.max}</span>
            <QuantityInput
              value={max}
              onValueChange={setMax}
              maxFractionDigits={3}
              placeholder="—"
              className="h-9 text-right tabular-nums"
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {copy.bulk.cancel}
          </Button>
          <Button
            type="button"
            disabled={
              selectedCount === 0 ||
              (min === "" && reorder === "" && max === "")
            }
            onClick={() => {
              onApply({ min, reorder, max });
              reset();
            }}
          >
            {copy.bulk.applyAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
