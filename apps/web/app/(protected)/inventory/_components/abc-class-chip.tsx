"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import { ABC_CLASS_LABELS_VI } from "@comtammatu/shared/labels";

interface AbcClassChipProps {
  class_: "A" | "B" | "C" | null | undefined;
  /** Show tooltip with stricter threshold note for A-class. */
  withTooltip?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Pareto A/B/C pill (S13a).
 * A class uses a tighter follow-up threshold (3%/100k vs 5%/200k).
 */
export function AbcClassChip({
  class_,
  withTooltip,
  compact,
  className,
}: AbcClassChipProps) {
  if (!class_) return null;

  const tone = {
    A: "bg-destructive/15 text-destructive border-destructive/20",
    B: "bg-warning/15 text-warning-foreground border-warning/20",
    C: "bg-muted text-muted-foreground border-border",
  }[class_];

  const label = compact ? class_ : ABC_CLASS_LABELS_VI[class_];
  const tooltip = withTooltip
    ? class_ === "A"
      ? "Nhóm A — ngưỡng kiểm tra chặt: 3% hoặc 100k VND"
      : class_ === "B"
        ? "Nhóm B — ngưỡng 5% hoặc 200k VND"
        : "Nhóm C — ngưỡng 5% hoặc 200k VND"
    : undefined;

  return (
    <Badge
      variant="outline"
      className={cn("border font-medium", tone, className)}
      data-slot="abc-class-chip"
      data-class={class_}
      title={tooltip}
    >
      {label}
    </Badge>
  );
}
