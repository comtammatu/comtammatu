"use client";

// Internal client-only chunk that pulls in Recharts. Split out from
// revenue-client.tsx so the dynamic-import boundary keeps Recharts (~95
// KB gzip) out of the initial bundle. Mirrors the trend-sparkline split.

import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type ChartConfig,
} from "@comtammatu/ui/components/chart";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import { ChartCard } from "../components/chart-card";

const revCopy = messages.finance.revenue;

export interface TrendPoint {
  period: string;
  revenue: number;
}

interface RevenueChartsBlockProps {
  trendData: TrendPoint[];
  resolvedStart: string;
  resolvedEnd: string;
  granularityLabel: string;
}

export function RevenueChartsBlock({
  trendData,
  resolvedStart,
  resolvedEnd,
  granularityLabel,
}: RevenueChartsBlockProps) {
  return (
    <ChartCard
      title={revCopy.trendChart.title}
      description={revCopy.trendChart.description(
        resolvedStart,
        resolvedEnd,
        granularityLabel,
      )}
      config={
        {
          revenue: {
            label: revCopy.trendChart.tooltipLabel,
            theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
          },
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
          formatter={(value) => [
            formatVND(Number(value ?? 0)),
            revCopy.trendChart.tooltipLabel,
          ]}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ChartCard>
  );
}
