"use client";

import { useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { matchesSearch } from "@lib/search";
import {
  Search as IconSearch,
  Check as IconCheck,
  FlagTriangleRight as IconFlag3,
} from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormattedNumberInput } from "./formatted-number-input";
import { AbcClassChip } from "./abc-class-chip";
import type { StocktakeLineBlind } from "../stocktake-actions";
import type { CountUnitOption } from "../_lib/count-units";
import type { DraftCounts } from "./stocktake-draft-saver";

import { FORM_VI, INVENTORY_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

interface BlindCountingGridProps {
  lines: StocktakeLineBlind[];
  counts: DraftCounts;
  onCountChange: (ingredientId: number, qty: number | null) => void;
  /** Counting-unit options per ingredient (all active units, base first). */
  unitOptionsByIngredient: Record<number, CountUnitOption[]>;
  /** Selected counting unit (entry_unit_id) per ingredient. */
  unitByIngredient: Record<number, number>;
  onUnitChange: (ingredientId: number, unitId: number) => void;
  /**
   * When true, the counter has no idea what system expected. Default for
   * daily/weekly/monthly/quarterly modes per spec §Q2.
   */
  blindMode: boolean;
  /** Disable inputs for rounds that are finalized. */
  readOnly?: boolean;
  /** Optional filter — only show lines that need a follow-up count. */
  onlyNeedsRecount?: boolean;
  className?: string;
}

/**
 * Core counter input surface (S13a).
 *
 * Each row = 1 ingredient. Shows:
 *   - Ingredient name + ABC class chip
 *   - Qty input (FormattedNumberInput, vi-VN grouping)
 *   - Follow-up badge when the server returned is_final=false AND
 *     this row was touched in a prior round
 *   - Final-tick when is_final
 *
 * Blind mode: system_quantity never rendered — the server action already
 * strips it, but we also never reference it here defensively.
 */
export function BlindCountingGrid({
  lines,
  counts,
  onCountChange,
  unitOptionsByIngredient,
  unitByIngredient,
  onUnitChange,
  blindMode,
  readOnly,
  onlyNeedsRecount,
  className,
}: BlindCountingGridProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    return lines.filter((l) => {
      if (onlyNeedsRecount && !l.needsRecount) return false;
      if (!q) return true;
      return matchesSearch([l.ingredientName], q);
    });
  }, [lines, query, onlyNeedsRecount]);

  const totalEntered = useMemo(
    () =>
      Object.keys(counts).filter((k) => typeof counts[k]?.qty === "number")
        .length,
    [counts],
  );

  function handleQtyChange(ingredientId: number, raw: string) {
    if (!raw) {
      onCountChange(ingredientId, null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) onCountChange(ingredientId, parsed);
  }

  const columns: DataTableColumn<StocktakeLineBlind>[] = [
    {
      key: "ingredient",
      header: PRODUCT_VI.rawIngredient,
      render: (line) => (
        <div className="font-medium">{line.ingredientName}</div>
      ),
    },
    {
      key: "abc",
      header: "ABC",
      render: (line) => (
        <AbcClassChip class_={line.abcClass} compact withTooltip />
      ),
    },
    {
      key: "unit",
      header: FORM_VI.unit,
      className: "text-muted-foreground",
      render: (line) => (
        <CountUnitSelect
          line={line}
          options={unitOptionsByIngredient[line.ingredientId] ?? []}
          value={unitByIngredient[line.ingredientId] ?? null}
          disabled={readOnly || line.isFinal}
          onChange={(unitId) => onUnitChange(line.ingredientId, unitId)}
        />
      ),
    },
    {
      key: "count",
      header: INVENTORY_VI.countedQtyHeader,
      className: "text-right",
      render: (line) => (
        <FormattedNumberInput
          value={
            counts[line.ingredientId]?.qty == null
              ? ""
              : String(counts[line.ingredientId]?.qty)
          }
          disabled={readOnly || line.isFinal}
          maxFractionDigits={3}
          className="ml-auto h-9 w-32 text-right tabular-nums"
          onValueChange={(raw) => handleQtyChange(line.ingredientId, raw)}
          data-slot="blind-counting-grid-qty"
          data-ingredient-id={line.ingredientId}
        />
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      className: "text-right",
      render: (line) => <CountStatusBadge line={line} />,
    },
  ];

  return (
    <div
      data-slot="blind-counting-grid"
      data-blind={blindMode ? "true" : "false"}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={INVENTORY_VI.searchIngredientPlaceholder}
            className="pl-8"
            data-slot="blind-counting-grid-search"
          />
        </div>
        <Badge variant="outline" className="gap-1">
          {INVENTORY_VI.rowRatio(filtered.length, lines.length)}
        </Badge>
        <Badge variant="outline" className="gap-1">
          {INVENTORY_VI.enteredCountBadge(totalEntered)}
        </Badge>
        {blindMode ? (
          <Badge
            variant="outline"
            className="border-warning/40 bg-warning/10 text-warning-foreground"
          >
            Blind mode
          </Badge>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(line) => line.lineId}
        emptyTitle={INVENTORY_VI.blindGridEmptyTitle}
        emptyMode={query.trim() ? "no-results" : "no-data"}
        getRowDataState={(line) =>
          line.isFinal ? "final" : line.needsRecount ? "needs-recount" : "open"
        }
        rowClassName={(line) =>
          cn(
            "align-middle",
            line.isFinal && "bg-success/10",
            !line.isFinal && line.needsRecount && "bg-tier-note/10",
          )
        }
        mobileCardRender={(line) => (
          <CountLineItem
            line={line}
            value={counts[line.ingredientId]?.qty ?? null}
            readOnly={readOnly || line.isFinal}
            onChange={(raw) => handleQtyChange(line.ingredientId, raw)}
            unitOptions={unitOptionsByIngredient[line.ingredientId] ?? []}
            unitValue={unitByIngredient[line.ingredientId] ?? null}
            onUnitChange={(unitId) => onUnitChange(line.ingredientId, unitId)}
          />
        )}
      />
    </div>
  );
}

function CountLineItem({
  line,
  value,
  readOnly,
  onChange,
  unitOptions,
  unitValue,
  onUnitChange,
}: {
  line: StocktakeLineBlind;
  value: number | null;
  readOnly: boolean;
  onChange: (raw: string) => void;
  unitOptions: CountUnitOption[];
  unitValue: number | null;
  onUnitChange: (unitId: number) => void;
}) {
  return (
    <Item
      variant="outline"
      className={cn(
        line.isFinal && "bg-success/10",
        !line.isFinal && line.needsRecount && "bg-tier-note/10",
      )}
      data-row-state={
        line.isFinal ? "final" : line.needsRecount ? "needs-recount" : "open"
      }
    >
      <ItemHeader>
        <ItemTitle>{line.ingredientName}</ItemTitle>
        <CountStatusBadge line={line} />
      </ItemHeader>
      <ItemContent>
        <ItemDescription className="flex items-center gap-2">
          <AbcClassChip class_={line.abcClass} compact withTooltip />
        </ItemDescription>
      </ItemContent>
      <ItemFooter className="gap-2">
        <CountUnitSelect
          line={line}
          options={unitOptions}
          value={unitValue}
          disabled={readOnly}
          onChange={onUnitChange}
          className="h-9 w-28"
        />
        <FormattedNumberInput
          value={value === null ? "" : String(value)}
          disabled={readOnly}
          maxFractionDigits={3}
          className="ml-auto h-9 w-full max-w-40 text-right tabular-nums"
          onValueChange={onChange}
          data-slot="blind-counting-grid-qty"
          data-ingredient-id={line.ingredientId}
        />
      </ItemFooter>
    </Item>
  );
}

/**
 * Counting-unit picker for a line. Shows a Select of all the ingredient's
 * active units (base first) when options exist; otherwise falls back to the
 * static unit string from the line.
 */
function CountUnitSelect({
  line,
  options,
  value,
  disabled,
  onChange,
  className,
}: {
  line: StocktakeLineBlind;
  options: CountUnitOption[];
  value: number | null;
  disabled?: boolean;
  onChange: (unitId: number) => void;
  className?: string;
}) {
  if (options.length === 0) {
    return <span className="text-muted-foreground">{line.unit}</span>;
  }
  return (
    <Select
      value={value != null ? String(value) : ""}
      onValueChange={(raw) => onChange(Number(raw))}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn("h-9 w-24", className)}
        aria-label={FORM_VI.unit}
        data-slot="blind-counting-grid-unit"
        data-ingredient-id={line.ingredientId}
      >
        <SelectValue placeholder={FORM_VI.unit} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.unitId} value={String(option.unitId)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CountStatusBadge({ line }: { line: StocktakeLineBlind }) {
  if (line.isFinal) {
    return (
      <Badge variant="outline" className="gap-1 border-success/40 text-success">
        <IconCheck className="size-3.5" /> Final
      </Badge>
    );
  }

  if (line.needsRecount) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-tier-note/40 text-tier-note-foreground"
      >
        <IconFlag3 className="size-3.5" /> {INVENTORY_VI.needsRecheckBadge}
      </Badge>
    );
  }

  return <Badge variant="outline">R{line.roundNo}</Badge>;
}

interface BlindCountingGridToolbarProps {
  onSubmit: () => void;
  submitting: boolean;
  canSubmit: boolean;
  onToggleOnlyRecount?: () => void;
  onlyRecount?: boolean;
  children?: React.ReactNode;
}

/**
 * Footer toolbar paired with the grid. The host page decides how submit
 * wiring happens — this is just the button group.
 */
export function BlindCountingGridToolbar({
  onSubmit,
  submitting,
  canSubmit,
  onToggleOnlyRecount,
  onlyRecount,
  children,
}: BlindCountingGridToolbarProps) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-background/90 px-3 pt-3 chrome-safe-pb backdrop-blur">
      <div className="flex items-center gap-2">
        {onToggleOnlyRecount ? (
          <Button
            type="button"
            size="sm"
            variant={onlyRecount ? "default" : "outline"}
            onClick={onToggleOnlyRecount}
          >
            {onlyRecount
              ? INVENTORY_VI.recheckFilterOn
              : INVENTORY_VI.recheckFilterOff}
          </Button>
        ) : null}
        {children}
      </div>
      <Button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
      >
        {submitting
          ? INVENTORY_VI.submittingEllipsis
          : INVENTORY_VI.saveCountsAction}
      </Button>
    </div>
  );
}
