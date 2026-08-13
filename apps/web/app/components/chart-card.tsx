"use client";

import type { ReactNode } from "react";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/chart";
import { cn } from "@comtammatu/ui/lib/utils";
import { AppEmptyState, AppSection } from "@/components/surface";

interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  config: ChartConfig;
  children: React.ComponentProps<typeof ChartContainer>["children"];
  empty?: boolean;
  emptyLabel: string;
  chartClassName?: string;
  className?: string;
}

export function ChartCard({
  title,
  description,
  actions,
  config,
  children,
  empty,
  emptyLabel,
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
