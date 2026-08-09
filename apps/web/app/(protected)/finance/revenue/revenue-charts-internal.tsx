"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type ChartConfig,
} from "@/components/chart";
import { formatAccountingVND as formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { ChartCard } from "../components/chart-card";

const revCopy = messages.finance.revenue;
const paceCopy = messages.finance.revenueTargets.progress;

export interface TrendPoint {
  period: string;
  revenue: number;
  pace?: number | null;
}

interface RevenueChartsBlockProps {
  trendData: TrendPoint[];
  resolvedStart: string;
  resolvedEnd: string;
  granularityLabel: string;
  showPace?: boolean;
}

export function RevenueChartsBlock({
  trendData,
  resolvedStart,
  resolvedEnd,
  granularityLabel,
  showPace = false,
}: RevenueChartsBlockProps) {
  const hasPace = showPace && trendData.some((point) => point.pace != null);
  return (
    <ChartCard
      title={hasPace ? paceCopy.paceChartTitle : revCopy.trendChart.title}
      description={
        hasPace
          ? paceCopy.paceChartDescription
          : revCopy.trendChart.description(
              resolvedStart,
              resolvedEnd,
              granularityLabel,
            )
      }
      config={
        {
          revenue: {
            label: hasPace
              ? paceCopy.paceActual
              : revCopy.trendChart.tooltipLabel,
            theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
          },
          ...(hasPace
            ? {
                pace: {
                  label: paceCopy.paceTarget,
                  theme: { light: "var(--chart-2)", dark: "var(--chart-2)" },
                },
              }
            : {}),
        } satisfies ChartConfig
      }
      chartClassName="aspect-[3/1]"
      empty={trendData.length === 0}
    >
      <LineChart
        data={trendData}
        margin={{ top: 8, right: 12, left: 12, bottom: 8 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="period" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={70}
          tickFormatter={(v: number) => formatVND(v)}
        />
        <Tooltip
          formatter={(value, name) => [
            formatVND(Number(value ?? 0)),
            name === "pace" ? paceCopy.paceTarget : paceCopy.paceActual,
          ]}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          dot={false}
        />
        {hasPace ? (
          <Line
            type="monotone"
            dataKey="pace"
            stroke="var(--color-pace)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
          />
        ) : null}
      </LineChart>
    </ChartCard>
  );
}
