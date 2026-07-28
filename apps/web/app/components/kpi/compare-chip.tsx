import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatPercent } from "@comtammatu/shared/format";
import { cn } from "@comtammatu/ui/lib/utils";

// Compare delta semantic — green = improvement, red = regression,
// muted = neutral / no prior data. Owner Q3+Q4: lower-better metrics
// (voided %, discount %) flip the goodness mapping at the call site;
// this component is dumb and renders the sign you give it.
//
// Sizes: "xs" pairs with KpiCard inline delta; "sm" stands alone in
// section headers. No "lg" — finance UI doesn't need a hero delta chip.
type CompareTone = "good" | "bad" | "neutral";

interface CompareChipProps {
  /** Display text e.g. "+12,3%" or "Mới" */
  label: string;
  tone: CompareTone;
  size?: "xs" | "sm";
  /** Optional secondary label e.g. "so với kỳ trước" */
  hint?: string;
  className?: string;
}

const TONE_CLASS: Record<CompareTone, string> = {
  good: "text-success",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
};

const SIZE_CLASS: Record<NonNullable<CompareChipProps["size"]>, string> = {
  xs: "text-xs gap-1",
  sm: "text-sm gap-1.5",
};

const ICON_SIZE: Record<NonNullable<CompareChipProps["size"]>, string> = {
  xs: "size-3",
  sm: "size-3.5",
};

export function CompareChip({
  label,
  tone,
  size = "xs",
  hint,
  className,
}: CompareChipProps) {
  const Icon = tone === "good" ? ArrowUp : tone === "bad" ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium tabular-nums",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
      // Screen readers read the icon as decoration; the label carries
      // the meaning. Using aria-hidden on the icon avoids "up arrow
      // 12 percent up" double-speak.
    >
      <Icon className={cn(ICON_SIZE[size])} aria-hidden />
      <span>{label}</span>
      {hint ? (
        <span className="max-w-[12rem] truncate font-normal text-muted-foreground">
          · {hint}
        </span>
      ) : null}
    </span>
  );
}

// Build a CompareTone given current/previous numbers and whether the
// metric is "lower is better" (e.g. void rate). Centralized so KpiCard
// callers don't reinvent the sign convention.
export type CompareKind = "higher_better" | "lower_better";

export interface CompareDelta {
  label: string;
  tone: CompareTone;
}

export function buildCompareDelta(
  current: number,
  previous: number,
  kind: CompareKind,
): CompareDelta {
  if (previous === 0 && current === 0) {
    return { label: "= 0", tone: "neutral" };
  }
  if (previous === 0) {
    return { label: "Mới", tone: "neutral" };
  }
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  const sign = diff > 0 ? "+" : "";
  const label = `${sign}${formatPercent(pct)}`;
  if (diff === 0) return { label: "0%", tone: "neutral" };
  const isImprovement = kind === "higher_better" ? diff > 0 : diff < 0;
  return { label, tone: isImprovement ? "good" : "bad" };
}
