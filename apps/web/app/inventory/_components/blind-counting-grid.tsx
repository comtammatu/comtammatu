"use client";

import { useMemo, useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Search as IconSearch, Check as IconCheck, FlagTriangleRight as IconFlag3 } from "lucide-react";
import { FormattedNumberInput } from "./formatted-number-input";
import { AbcClassChip } from "./abc-class-chip";
import type { StocktakeLineBlind } from "../stocktake-actions";
import type { DraftCounts } from "./stocktake-draft-saver";

interface BlindCountingGridProps {
  lines: StocktakeLineBlind[];
  counts: DraftCounts;
  onCountChange: (ingredientId: number, qty: number | null) => void;
  /**
   * When true, the counter has no idea what system expected. Default for
   * daily/weekly/monthly/quarterly modes per spec §Q2.
   */
  blindMode: boolean;
  /** Disable inputs for rounds that are finalized. */
  readOnly?: boolean;
  /** Optional filter — only show lines flagged needs_recount. Used for R2+. */
  onlyNeedsRecount?: boolean;
  className?: string;
}

/**
 * Core counter input surface (S13a).
 *
 * Each row = 1 ingredient. Shows:
 *   - Ingredient name + ABC class chip
 *   - Qty input (FormattedNumberInput, vi-VN grouping)
 *   - Need-recount badge when the server returned is_final=false AND
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
  blindMode,
  readOnly,
  onlyNeedsRecount,
  className,
}: BlindCountingGridProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      if (onlyNeedsRecount && !l.needsRecount) return false;
      if (!q) return true;
      return l.ingredientName.toLowerCase().includes(q);
    });
  }, [lines, query, onlyNeedsRecount]);

  const totalEntered = useMemo(
    () => Object.keys(counts).filter((k) => typeof counts[k]?.qty === "number").length,
    [counts],
  );

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
            placeholder="Tìm nguyên liệu…"
            className="pl-8"
            data-slot="blind-counting-grid-search"
          />
        </div>
        <Badge variant="outline" className="gap-1">
          {filtered.length}/{lines.length} dòng
        </Badge>
        <Badge variant="outline" className="gap-1">
          Đã nhập: {totalEntered}
        </Badge>
        {blindMode ? (
          <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-foreground">
            Blind mode
          </Badge>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nguyên liệu</th>
              <th className="px-3 py-2 font-medium">ABC</th>
              <th className="px-3 py-2 font-medium">Đơn vị</th>
              <th className="px-3 py-2 text-right font-medium">Số đếm</th>
              <th className="px-3 py-2 text-right font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Không có dòng nào khớp bộ lọc.
                </td>
              </tr>
            ) : (
              filtered.map((line) => (
                <CountRow
                  key={line.lineId}
                  line={line}
                  value={counts[line.ingredientId]?.qty ?? null}
                  readOnly={readOnly || line.isFinal}
                  onChange={(qty) => onCountChange(line.ingredientId, qty)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CountRow({
  line,
  value,
  readOnly,
  onChange,
}: {
  line: StocktakeLineBlind;
  value: number | null;
  readOnly: boolean;
  onChange: (qty: number | null) => void;
}) {
  const rowTone = line.isFinal
    ? "bg-success/10"
    : line.needsRecount
      ? "bg-tier-note/10"
      : "";

  return (
    <tr
      className={cn("border-t align-middle", rowTone)}
      data-row-state={
        line.isFinal ? "final" : line.needsRecount ? "needs-recount" : "open"
      }
    >
      <td className="px-3 py-2">
        <div className="font-medium">{line.ingredientName}</div>
      </td>
      <td className="px-3 py-2">
        <AbcClassChip class_={line.abcClass} compact withTooltip />
      </td>
      <td className="px-3 py-2 text-muted-foreground">{line.unit}</td>
      <td className="px-3 py-2 text-right">
        <FormattedNumberInput
          value={value === null ? "" : String(value)}
          disabled={readOnly}
          maxFractionDigits={3}
          className="ml-auto h-9 w-32 text-right tabular-nums"
          onValueChange={(raw) => {
            if (!raw) return onChange(null);
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
          data-slot="blind-counting-grid-qty"
          data-ingredient-id={line.ingredientId}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          {line.isFinal ? (
            <Badge variant="outline" className="gap-1 border-success/40 text-success">
              <IconCheck className="size-3.5" /> Final
            </Badge>
          ) : line.needsRecount ? (
            <Badge
              variant="outline"
              className="gap-1 border-tier-note/40 text-tier-note-foreground"
            >
              <IconFlag3 className="size-3.5" /> Cần recount
            </Badge>
          ) : (
            <Badge variant="outline">R{line.roundNo}</Badge>
          )}
        </div>
      </td>
    </tr>
  );
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
            {onlyRecount ? "Đang lọc: cần recount" : "Chỉ xem cần recount"}
          </Button>
        ) : null}
        {children}
      </div>
      <Button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
      >
        {submitting ? "Đang gửi…" : "Kết thúc round"}
      </Button>
    </div>
  );
}
