import { cn } from "@comtammatu/ui";
import { formatQty } from "../_lib/format";

export type StockLocationBreakdown = {
  locationId: number;
  name: string;
  code: string;
  locationKind: string;
  qty: number;
  avgUnitCost: number | null;
  lastCountedAt: string | null;
};

function visibleLocationRows(rows: StockLocationBreakdown[]) {
  return rows.filter((row) => row.qty !== 0);
}

function shouldShowLocationBreakdown(rows: StockLocationBreakdown[]) {
  const visibleRows = visibleLocationRows(rows);
  return (
    visibleRows.length > 1 ||
    visibleRows.some((row) => row.locationKind === "kitchen")
  );
}

function stockLocationLabel(row: StockLocationBreakdown) {
  if (row.locationKind === "warehouse") return "Kho";
  if (row.locationKind === "kitchen") return "Bếp";

  return row.name;
}

export function StockLocationBreakdownLine({
  rows = [],
  className,
}: {
  rows?: StockLocationBreakdown[];
  className?: string;
}) {
  if (!shouldShowLocationBreakdown(rows)) return null;

  return (
    <span
      className={cn(
        "block text-xs font-normal leading-snug text-muted-foreground",
        className,
      )}
    >
      {visibleLocationRows(rows)
        .map((row) => `${stockLocationLabel(row)}: ${formatQty(row.qty)}`)
        .join(" | ")}
    </span>
  );
}
