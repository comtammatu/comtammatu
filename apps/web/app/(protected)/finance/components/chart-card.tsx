"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  ChartContainer,
  type ChartConfig,
} from "@comtammatu/ui/components/chart";
import { cn } from "@comtammatu/ui/lib/utils";

// Card shell + ChartContainer wrapper. The actual <LineChart>/<BarChart>
// children are passed in by the caller — this lets each consumer keep
// chart wiring in one place while sharing the title/description/empty
// state plumbing.
//
// Why not also wrap the chart type? Because Recharts' chart elements
// are component children, not props — the cleanest API is to let the
// caller pass `<LineChart>...<Line/>...</LineChart>` directly. Future
// callers stay free to compose stacked/grouped/pie variants without
// expanding this wrapper's surface.

interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (chip buttons, granularity switcher) */
  actions?: ReactNode;
  /** ChartContainer config — keys must match dataKey on Line/Bar/Area */
  config: ChartConfig;
  /** Chart subtree, e.g. <LineChart data={...}>...</LineChart> */
  children: React.ComponentProps<typeof ChartContainer>["children"];
  /** Show empty state instead of the chart */
  empty?: boolean;
  emptyLabel?: string;
  /** Tailwind class for chart aspect ratio. Default: aspect-video */
  chartClassName?: string;
  /** Card-level className for layout overrides */
  className?: string;
}

export function ChartCard({
  title,
  description,
  actions,
  config,
  children,
  empty,
  emptyLabel = "Chưa có dữ liệu trong khoảng này.",
  chartClassName,
  className,
}: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="space-y-0.5">
          <CardTitle>{title}</CardTitle>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
        {empty ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <ChartContainer
            config={config}
            className={cn("w-full", chartClassName)}
          >
            {children}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
