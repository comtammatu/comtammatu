import { cn } from "@comtammatu/ui";
import { formatQty } from "@lib/inventory/format";
import {
  shouldShowStockLocationBreakdown,
  stockLocationLabel,
  type StockLocationBreakdown,
} from "@lib/inventory/stock-on-hand-model";

export type { StockLocationBreakdown } from "@lib/inventory/stock-on-hand-model";

export function StockLocationBreakdownLine({
  rows = [],
  className,
}: {
  rows?: StockLocationBreakdown[];
  className?: string;
}) {
  if (!shouldShowStockLocationBreakdown(rows)) return null;

  return (
    <span
      className={cn(
        "block text-xs font-normal leading-snug text-muted-foreground tabular-nums",
        className,
      )}
    >
      {rows
        .map((row) => `${stockLocationLabel(row)}: ${formatQty(row.qty)}`)
        .join(" · ")}
    </span>
  );
}
