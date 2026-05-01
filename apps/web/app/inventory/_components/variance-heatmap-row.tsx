"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { OctagonAlert as IconAlertOctagon, FlagTriangleRight as IconFlag3, Check as IconCheck } from "lucide-react";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { AbcClassChip } from "./abc-class-chip";

import { FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
interface RoundCount {
  roundNo: 1 | 2 | 3 | 4;
  countedQuantity: number | null;
  countedBy: string | null;
}

interface VarianceHeatmapRowProps {
  ingredientId: number;
  ingredientName: string;
  unit: string;
  abcClass: "A" | "B" | "C" | null;
  rounds: RoundCount[];
  /** Whether the row is locked (is_final) or still awaiting recount. */
  isFinal: boolean;
  needsRecount: boolean;
  /** Threshold % used for this row (derived from ABC class). */
  thresholdPct: number;
  /** Click handler — opens detail/escalate sheet. */
  onClick?: () => void;
  className?: string;
}

/**
 * Recount heatmap row (S13b R2+ view).
 *
 * Counter at R2/R3 is NOT blind — they see the R1 count and current delta,
 * which helps identify entry errors vs actual shrink. Each round's cell is
 * tinted by how far it deviates from the median of prior rounds.
 *
 * Unlike BlindCountingGrid, this is a READ-ONLY visualization — recount
 * input happens through the existing grid filtered to `onlyNeedsRecount`.
 */
export function VarianceHeatmapRow({
  ingredientId,
  ingredientName,
  unit,
  abcClass,
  rounds,
  isFinal,
  needsRecount,
  thresholdPct,
  onClick,
  className,
}: VarianceHeatmapRowProps) {
  const roundsByNo = new Map<number, RoundCount>();
  for (const r of rounds) roundsByNo.set(r.roundNo, r);

  const values = rounds
    .map((r) => r.countedQuantity)
    .filter((v): v is number => typeof v === "number");
  const median = values.length > 0 ? computeMedian(values) : null;

  return (
    <TableRow
      data-slot="variance-heatmap-row"
      data-ingredient-id={ingredientId}
      data-state={isFinal ? "final" : needsRecount ? "needs-recount" : "open"}
      onClick={onClick}
      className={cn(
        "align-middle",
        isFinal ? "bg-success/10" : needsRecount ? "bg-tier-note/10" : "",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <TableCell>
        <div className="font-medium">{ingredientName}</div>
        <div className="text-xs text-muted-foreground">{unit}</div>
      </TableCell>
      <TableCell>
        <AbcClassChip class_={abcClass} compact withTooltip />
      </TableCell>
      {[1, 2, 3, 4].map((rn) => {
        const r = roundsByNo.get(rn);
        const qty = r?.countedQuantity ?? null;
        const tone = median !== null && qty !== null ? cellTone(qty, median, thresholdPct) : "";
        return (
          <TableCell
            key={rn}
            className={cn("text-right tabular-nums", tone)}
            data-round={rn}
          >
            {qty === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="font-medium">{formatQty(qty)}</span>
            )}
          </TableCell>
        );
      })}
      <TableCell className="text-right">
        {isFinal ? (
          <Badge variant="outline" className="gap-1 border-success/40 text-success">
            <IconCheck className="size-3.5" /> Final
          </Badge>
        ) : needsRecount ? (
          <Badge variant="outline" className="gap-1 border-tier-note/40 text-tier-note-foreground">
            <IconFlag3 className="size-3.5" /> Cần recount
          </Badge>
        ) : (
          <Badge variant="outline">Chờ</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

function cellTone(qty: number, median: number, thresholdPct: number): string {
  if (median === 0) return "";
  const pct = Math.abs((qty - median) / median) * 100;
  if (pct > thresholdPct * 2) return "bg-destructive/15 text-destructive";
  if (pct > thresholdPct) return "bg-tier-note/15 text-tier-note-foreground";
  if (pct > thresholdPct / 2) return "bg-warning/15 text-warning-foreground";
  return "";
}

function computeMedian(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  if (a === undefined) return 0;
  if (sorted.length % 2 === 0) {
    const b = sorted[mid - 1] ?? a;
    return (a + b) / 2;
  }
  return a;
}

function formatQty(q: number): string {
  return q.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

interface VarianceHeatmapTableProps {
  rows: Array<React.ComponentProps<typeof VarianceHeatmapRow>>;
  /** Render the escalate icon column when R4 is reachable. */
  showEscalateIcon?: boolean;
  className?: string;
}

export function VarianceHeatmapTable({
  rows,
  showEscalateIcon,
  className,
}: VarianceHeatmapTableProps) {
  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{PRODUCT_VI.rawIngredient}</TableHead>
            <TableHead>ABC</TableHead>
            <TableHead className="text-right">R1</TableHead>
            <TableHead className="text-right">R2</TableHead>
            <TableHead className="text-right">R3</TableHead>
            <TableHead className="text-right">R4</TableHead>
            <TableHead className="text-right">{FORM_VI.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmptyStateRow
              colSpan={7}
              title="Chưa có dòng biến động nào."
              icon={
                showEscalateIcon ? null : (
                  <IconAlertOctagon className="size-4" />
                )
              }
            />
          ) : (
            rows.map((r) => <VarianceHeatmapRow key={r.ingredientId} {...r} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}
