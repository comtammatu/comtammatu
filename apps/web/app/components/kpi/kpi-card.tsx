import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { cn } from "@comtammatu/ui/lib/utils";
import { CompareChip, type CompareDelta } from "./compare-chip";
import { TrendSparkline, type TrendPoint } from "./trend-sparkline";

type KpiTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "destructive";

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
  /** Compare delta (built via buildCompareDelta) */
  delta?: CompareDelta | null;
  /** Compare period label e.g. "vs kỳ trước" */
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
  className?: string;
}

export function KpiCard({
  label,
  value,
  delta,
  compareHint = "vs kỳ trước",
  hint,
  tone = "neutral",
  href,
  sparkline,
  sparklineLabel,
  icon,
  className,
}: KpiCardProps) {
  const Body = (
    <CardContent
      className={cn(
        "relative flex h-full min-h-32 flex-col gap-3",
        href ? "transition-colors hover:bg-muted/40" : undefined,
      )}
    >
      <div className="flex min-h-8 items-start justify-between gap-2">
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
          "min-w-0 break-words text-2xl leading-tight font-bold tabular-nums",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      <div className="min-h-5">
        {delta ? (
          <CompareChip
            label={delta.label}
            tone={delta.tone}
            hint={compareHint}
          />
        ) : null}
      </div>
      <div className="min-h-8 line-clamp-2 break-words text-xs text-muted-foreground">
        {hint}
      </div>
      {sparkline && sparkline.length > 0 ? (
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
    return <Card className={cn("h-full", className)}>{Body}</Card>;
  }
  return (
    <Link
      href={href}
      className={cn(
        "block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      aria-label={typeof value === "string" ? `${label}: ${value}` : label}
    >
      <Card className="h-full">{Body}</Card>
    </Link>
  );
}
