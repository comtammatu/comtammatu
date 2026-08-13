"use client";

import { useMemo, useState, useTransition } from "react";
import { Search as IconSearch } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { NumberPadSheet } from "@/components/form";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { bulkUpdateIngredientThresholds } from "@/(protected)/inventory/settings/thresholds/actions";
import { formatQty } from "@lib/inventory/format";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import { CatalogBackControl } from "../catalog-back-header";

const copy = messages.catalog.thresholds;
const editorCopy = messages.inventory.settings.thresholds;

export type ThresholdRow = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  minStock: string;
};

type EditableRow = ThresholdRow & { initialMin: string };

type PadTarget =
  | { mode: "row"; id: number }
  | { mode: "bulk" };

function minValue(row: EditableRow): number | null {
  const value = Number(row.minStock.trim());
  return row.minStock.trim() !== "" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function rowIsDirty(row: EditableRow): boolean {
  return row.minStock !== row.initialMin;
}

function rowClassName(row: EditableRow): string {
  if (!rowIsDirty(row)) return "min-h-12";
  return minValue(row) == null
    ? "min-h-12 bg-destructive/10"
    : "min-h-12 bg-warning/10";
}

export function CatalogThresholdsClient({
  backHref,
  rows,
}: {
  backHref: string;
  rows: ThresholdRow[];
}) {
  const [editable, setEditable] = useState<EditableRow[]>(() =>
    rows.map((row) => ({ ...row, initialMin: row.minStock })),
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [pad, setPad] = useState<PadTarget | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const query = search.trim();
    if (!query) return editable;
    return editable.filter((row) => matchesSearch([row.name, row.sku], query));
  }, [editable, search]);

  const dirtyRows = useMemo(() => editable.filter(rowIsDirty), [editable]);
  const invalidCount = dirtyRows.filter((row) => minValue(row) == null).length;
  const visibleIds = filtered.map((row) => row.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  const padRow =
    pad?.mode === "row"
      ? (editable.find((row) => row.id === pad.id) ?? null)
      : null;
  const padOpen = pad != null;
  const padTitle =
    pad?.mode === "bulk"
      ? editorCopy.bulk.dialogTitle
      : padRow
        ? `${editorCopy.cols.min} · ${padRow.name}`
        : editorCopy.cols.min;
  const padInitial = padRow != null ? minValue(padRow) : null;
  const padSuffix = padRow?.unit;

  function patchRows(ids: ReadonlySet<number>, value: string) {
    setEditable((current) =>
      current.map((row) =>
        ids.has(row.id) ? { ...row, minStock: value } : row,
      ),
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

  function toggleVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function handlePadConfirm(value: number) {
    const next = String(value);
    if (pad?.mode === "bulk") {
      patchRows(selected, next);
    } else if (pad?.mode === "row") {
      patchRows(new Set([pad.id]), next);
    }
    setPad(null);
  }

  function handleSave() {
    if (dirtyRows.length === 0) {
      toast.info(editorCopy.save.nothing);
      return;
    }
    if (invalidCount > 0) {
      toast.error(copy.invalid);
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
        toast.error(result.error ?? editorCopy.save.failed);
        return;
      }
      const data = result.data as { updated: number };
      toast.success(editorCopy.save.success(data.updated));
      setEditable((current) =>
        current.map((row) => ({ ...row, initialMin: row.minStock })),
      );
      setSelected(new Set());
    });
  }

  const emptyTitle =
    editable.length === 0
      ? copy.empty
      : copy.noResults;

  return (
    <div className="flex flex-col gap-3">
      <CatalogBackControl title={copy.title} backHref={backHref} />
      <p className="text-xs text-muted-foreground">{editorCopy.hint}</p>

      <InputGroup className="h-11">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          inputMode="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={copy.searchPlaceholder}
        />
      </InputGroup>

      {editable.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-h-12 items-center gap-2 text-sm">
            <Checkbox
              id="catalog-thresholds-select-all"
              size="touch"
              checked={
                allVisibleSelected
                  ? true
                  : someVisibleSelected
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(value) => toggleVisible(value === true)}
            />
            <label htmlFor="catalog-thresholds-select-all">
              {editorCopy.selectAllAria}
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={selected.size === 0}
            onClick={() => setPad({ mode: "bulk" })}
          >
            {editorCopy.bulk.applyTo(selected.size)}
          </Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <AppEmptyState compact title={emptyTitle} symbol="riceGrain" />
      ) : (
        <BranchOperatorPanel contentFlush>
          <ItemGroup className="gap-2">
            {filtered.map((row) => {
              const parsed = minValue(row);
              return (
                <Item
                  key={row.id}
                  variant="outline"
                  size="sm"
                  className={rowClassName(row)}
                >
                  <Checkbox
                    size="touch"
                    checked={selected.has(row.id)}
                    onCheckedChange={(value) =>
                      toggleRow(row.id, value === true)
                    }
                    aria-label={copy.selectAria(row.name)}
                  />
                  <ItemContent className="min-w-0">
                    <ItemTitle className="line-clamp-2 min-w-0 break-words text-sm font-medium">
                      {row.name}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-2 break-words">
                      {row.sku ?? "—"} · {row.unit}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="min-w-24 justify-end font-semibold tabular-nums"
                      aria-label={`${editorCopy.cols.min} ${row.name}`}
                      onClick={() => setPad({ mode: "row", id: row.id })}
                    >
                      <span
                        className={
                          parsed == null ? "text-muted-foreground" : undefined
                        }
                      >
                        {parsed == null ? "0" : formatQty(parsed)}
                      </span>
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </BranchOperatorPanel>
      )}

      <AppDetailFooter
        sticky
        leading={
          <span className="text-xs text-muted-foreground">
            {editorCopy.dirtySummary(dirtyRows.length, invalidCount)}
          </span>
        }
        trailing={
          <Button
            type="button"
            size="touch-lg"
            onClick={handleSave}
            disabled={isPending || dirtyRows.length === 0 || invalidCount > 0}
          >
            {isPending ? <Spinner className="mr-2" /> : null}
            {editorCopy.save.action(dirtyRows.length)}
          </Button>
        }
      />

      <NumberPadSheet
        open={padOpen}
        onOpenChange={(next) => {
          if (!next) setPad(null);
        }}
        title={padTitle}
        initialValue={padInitial}
        suffix={padSuffix}
        onConfirm={handlePadConfirm}
      />
    </div>
  );
}
