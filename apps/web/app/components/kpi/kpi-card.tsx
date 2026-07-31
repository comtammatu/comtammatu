import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { cn } from "@comtammatu/ui/lib/utils";
import { CompareChip, type CompareDelta } from "./compare-chip";
import { TrendSparkline, type TrendPoint } from "./trend-sparkline";

type KpiTone = "neutral" | "primary" | "success" | "warning" | "destructive";

const VALUE_TONE: Record<KpiTone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const DOT_TONE: Record<KpiTone, string> = {
  neutral: "bg-muted",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

interface KpiCardProps {
  label: string;
  value: ReactNode;
  shortValue?: ReactNode;
  valueLabel?: string;
  /** Compare delta (built via buildCompareDelta) */
  delta?: CompareDelta | null;
  /** Compare period label e.g. "so với kỳ trước" */
  compareHint?: string;
  /** Inline secondary metric e.g. "Chưa VAT · 1.234 lượt" */
  hint?: ReactNode;
  /** Visual tone — primary highlights hero KPI, warning/destructive flag SLA */
  tone?: KpiTone;
  /** Drill-down target. When set, the whole card is a Link. */
  href?: string;
  /** Optional sparkline series (≤30 points typical) */
  sparkline?: TrendPoint[];
  /** Sparkline screen-reader description */
  sparklineLabel?: string;
  /** Optional glyph shown top-right in a muted box (replaces the tone dot) */
  icon?: ReactNode;
  density?: "comfortable" | "compact";
  className?: string;
}

export function KpiCard({
  label,
  value,
  shortValue,
  valueLabel,
  delta,
  compareHint = "so với kỳ trước",
  hint,
  tone = "neutral",
  href,
  sparkline,
  sparklineLabel,
  icon,
  density = "comfortable",
  className,
}: KpiCardProps) {
  const isCompact = density === "compact";
  const hasSparkline = sparkline && sparkline.length > 0;
  const Body = (
    <CardContent
      className={cn(
        "relative flex h-full flex-col",
        isCompact ? "min-h-24 gap-2" : "min-h-32 gap-3",
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-2",
          !isCompact && "min-h-8",
        )}
      >
        <p className="line-clamp-2 min-w-0 break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon ? (
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            aria-hidden
          >
            {icon}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span
              className={cn("size-1.5 rounded-full", DOT_TONE[tone])}
              aria-hidden
            />
            {href ? (
              <ArrowUpRight
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </span>
        )}
      </div>
      <p
        className={cn(
          "min-w-0 break-words leading-tight font-semibold tabular-nums",
          isCompact ? "text-xl" : "text-2xl",
          VALUE_TONE[tone],
        )}
        title={shortValue && typeof value === "string" ? value : undefined}
      >
        {shortValue ?? value}
      </p>
      {delta ? (
        <CompareChip label={delta.label} tone={delta.tone} hint={compareHint} />
      ) : null}
      {hint ? (
        <div className="line-clamp-2 break-words text-xs text-muted-foreground">
          {hint}
        </div>
      ) : null}
      {hasSparkline ? (
        <div className="-mx-1 -mb-1 mt-auto h-8">
          <TrendSparkline
            data={sparkline}
            ariaLabel={sparklineLabel ?? `Xu hướng ${label}`}
            tone={
              tone === "destructive"
                ? "destructive"
                : tone === "warning"
                  ? "warning"
                  : tone === "success"
                    ? "success"
                    : "primary"
            }
          />
        </div>
      ) : null}
    </CardContent>
  );

  if (!href) {
    return (
      <Card
        size={isCompact ? "sm" : "default"}
        className={cn("h-full", className)}
      >
        {Body}
      </Card>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2",
        className,
      )}
      aria-label={
        valueLabel ?? (typeof value === "string" ? `${label}: ${value}` : label)
      }
    >
      <Card
        size={isCompact ? "sm" : "default"}
        className="h-full transition-[background-color,box-shadow] hover:bg-muted/50 hover:shadow-effect-card-hover"
      >
        {Body}
      </Card>
    </Link>
  );
}
