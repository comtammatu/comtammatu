"use client";

import { cn } from "@comtammatu/ui";
import { BASELINE_SOURCE_LABELS_VI } from "@comtammatu/shared/labels";
import { formatVND } from "@comtammatu/shared/format";

interface BaselineHintProps {
  /** 30-day avg unit cost from getBaselinePrice(); null → render "Chưa đủ lịch sử" */
  avgUnitCost: number | null;
  sampleN: number;
  source: "same_supplier" | "any_supplier" | "none" | "paused" | string;
  className?: string;
}

/**
 * Inline hint "TB 30 ngày: 88.000 VND • 5 lần" next to GRN line price input.
 * Matches spec §Q3 tier 1 UX: "Hint xám bên cạnh ô giá".
 */
export function BaselineHint({
  avgUnitCost,
  sampleN,
  source,
  className,
}: BaselineHintProps) {
  if (source === "paused") {
    return (
      <span
        className={cn("text-xs text-muted-foreground italic", className)}
        data-slot="baseline-hint"
        data-source="paused"
      >
        Baseline tạm dừng (30d sau hardblock override)
      </span>
    );
  }

  if (avgUnitCost === null || sampleN < 3) {
    return (
      <span
        className={cn("text-xs text-muted-foreground italic", className)}
        data-slot="baseline-hint"
        data-source={source}
      >
        Chưa đủ lịch sử (n={sampleN}) — QLV duyệt thủ công
      </span>
    );
  }

  const sourceLabel =
    (BASELINE_SOURCE_LABELS_VI as Record<string, string>)[source] ?? source;

  return (
    <span
      className={cn("text-xs text-muted-foreground", className)}
      data-slot="baseline-hint"
      data-source={source}
      title={`${sourceLabel} • n=${sampleN}`}
    >
      TB 30 ngày:{" "}
      <span className="font-medium text-foreground">
        {formatVND(avgUnitCost)}
      </span>
      <span className="ml-1">• {sampleN} lần</span>
    </span>
  );
}
