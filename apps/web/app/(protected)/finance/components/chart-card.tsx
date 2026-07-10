"use client";

import type { ReactNode } from "react";
import {
  ChartContainer,
  type ChartConfig,
} from "@comtammatu/ui/components/chart";
import { cn } from "@comtammatu/ui/lib/utils";
import { AppEmptyState, AppSection } from "@/components/surface";
import { messages } from "@lib/messages";

// Section shell + ChartContainer wrapper. The actual <LineChart>/<BarChart>
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
  /** Section-level className for layout overrides */
  className?: string;
}

export function ChartCard({
  title,
  description,
  actions,
  config,
  children,
  empty,
  emptyLabel = messages.finance.common.emptyInRange,
  chartClassName,
  className,
}: ChartCardProps) {
  return (
    <AppSection
      title={title}
      description={description}
      action={
        actions ? <div className="flex items-center gap-2">{actions}</div> : null
      }
      className={className}
    >
      {empty ? (
        <AppEmptyState compact title={emptyLabel} className="h-48" />
      ) : (
        <ChartContainer config={config} className={cn("w-full", chartClassName)}>
          {children}
        </ChartContainer>
      )}
    </AppSection>
  );
}
