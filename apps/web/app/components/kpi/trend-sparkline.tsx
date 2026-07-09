"use client";

import dynamic from "next/dynamic";
import { cn } from "@comtammatu/ui/lib/utils";

// Lazy-loaded so the chart code doesn't ship to the initial bundle.
// `ssr: false` matches the existing chart.tsx pattern in packages/ui —
// Recharts uses `useState`/`ResizeObserver` and would mismatch hydration
// otherwise. Architect §6 risk #1: bundle stays slim because every
// finance page mounts ~5+ sparklines.
const SparklineChart = dynamic(
  () => import("./trend-sparkline-internal").then((m) => m.SparklineChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full rounded-md bg-muted/30" aria-hidden />
    ),
  },
);

export interface TrendPoint {
  /** ISO date or arbitrary x-value used as React key */
  x: string;
  /** Numeric metric — null means "no data" (gap rendered as line break) */
  y: number | null;
}

interface TrendSparklineProps {
  data: TrendPoint[];
  /** Tailwind height classes — the parent owns layout */
  className?: string;
  /** ARIA description for screen readers (e.g. "Doanh thu 14 ngày") */
  ariaLabel: string;
  /** Use semantic-token color (Q4 design tokens). Default = chart-1 */
  tone?: "primary" | "success" | "warning" | "destructive";
}

const TONE_VAR: Record<NonNullable<TrendSparklineProps["tone"]>, string> = {
  primary: "var(--chart-1)",
  success: "var(--chart-2)",
  warning: "var(--chart-3)",
  destructive: "var(--chart-4)",
};

export function TrendSparkline({
  data,
  className,
  ariaLabel,
  tone = "primary",
}: TrendSparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-xs text-muted-foreground/60",
          className,
        )}
        role="img"
        aria-label={`${ariaLabel}: không có dữ liệu`}
      >
        —
      </div>
    );
  }
  return (
    <div
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <SparklineChart data={data} stroke={TONE_VAR[tone]} />
    </div>
  );
}
