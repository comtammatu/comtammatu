"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { IconAlertOctagon, IconFlag3, IconCheck } from "@tabler/icons-react";
import { AbcClassChip } from "./abc-class-chip";

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
    <tr
      data-slot="variance-heatmap-row"
      data-ingredient-id={ingredientId}
      data-state={isFinal ? "final" : needsRecount ? "needs-recount" : "open"}
      onClick={onClick}
      className={cn(
        "border-t align-middle",
        isFinal ? "bg-green-50/30" : needsRecount ? "bg-orange-50/30" : "",
        onClick && "cursor-pointer hover:bg-muted/40",
        className,
      )}
    >
      <td className="px-3 py-2">
        <div className="font-medium">{ingredientName}</div>
        <div className="text-xs text-muted-foreground">{unit}</div>
      </td>
      <td className="px-3 py-2">
        <AbcClassChip class_={abcClass} compact withTooltip />
      </td>
      {[1, 2, 3, 4].map((rn) => {
        const r = roundsByNo.get(rn);
        const qty = r?.countedQuantity ?? null;
        const tone = median !== null && qty !== null ? cellTone(qty, median, thresholdPct) : "";
        return (
          <td
            key={rn}
            className={cn(
              "px-3 py-2 text-right tabular-nums",
              tone,
            )}
            data-round={rn}
          >
            {qty === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="font-medium">{formatQty(qty)}</span>
            )}
          </td>
        );
      })}
      <td className="px-3 py-2 text-right">
        {isFinal ? (
          <Badge variant="outline" className="gap-1 border-green-300 text-green-900">
            <IconCheck className="size-3.5" /> Final
          </Badge>
        ) : needsRecount ? (
          <Badge variant="outline" className="gap-1 border-orange-300 text-orange-900">
            <IconFlag3 className="size-3.5" /> Cần recount
          </Badge>
        ) : (
          <Badge variant="outline">Chờ</Badge>
        )}
      </td>
    </tr>
  );
}

function cellTone(qty: number, median: number, thresholdPct: number): string {
  if (median === 0) return "";
  const pct = Math.abs((qty - median) / median) * 100;
  if (pct > thresholdPct * 2) return "bg-red-100 text-red-900";
  if (pct > thresholdPct) return "bg-orange-100 text-orange-900";
  if (pct > thresholdPct / 2) return "bg-yellow-50 text-yellow-900";
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
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Nguyên liệu</th>
            <th className="px-3 py-2 text-left font-medium">ABC</th>
            <th className="px-3 py-2 text-right font-medium">R1</th>
            <th className="px-3 py-2 text-right font-medium">R2</th>
            <th className="px-3 py-2 text-right font-medium">R3</th>
            <th className="px-3 py-2 text-right font-medium">R4</th>
            <th className="px-3 py-2 text-right font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                Chưa có dòng biến động nào.
                {showEscalateIcon ? null : (
                  <span className="ml-2">
                    <IconAlertOctagon className="inline size-3.5 -translate-y-[1px]" />
                  </span>
                )}
              </td>
            </tr>
          ) : (
            rows.map((r) => <VarianceHeatmapRow key={r.ingredientId} {...r} />)
          )}
        </tbody>
      </table>
    </div>
  );
}
