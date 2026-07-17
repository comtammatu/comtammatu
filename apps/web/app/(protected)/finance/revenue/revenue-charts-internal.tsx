"use client";

// Internal client-only chunk that pulls in Recharts. Split out from
// revenue-client.tsx so the dynamic-import boundary keeps Recharts (~95
// KB gzip) out of the initial bundle. Mirrors the trend-sparkline split.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

export interface PaymentPoint {
  key: string;
  label: string;
  value: number;
}

export interface BranchPoint {
  branchId: number;
  name: string;
  revenue: number;
  orders: number;
}

interface RevenueChartsBlockProps {
  trendData: TrendPoint[];
  resolvedStart: string;
  resolvedEnd: string;
  granularityLabel: string;
  paymentData: PaymentPoint[];
  paymentTotal: number;
  branchRows: BranchPoint[];
  branchActive: boolean;
}

export function RevenueChartsBlock({
  trendData,
  resolvedStart,
  resolvedEnd,
  granularityLabel,
  paymentData,
  paymentTotal,
  branchRows,
  branchActive,
}: RevenueChartsBlockProps) {
  return (
    <>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={revCopy.paymentChart.title}
          description={
            paymentTotal > 0
              ? revCopy.paymentChart.total(formatVND(paymentTotal))
              : revCopy.paymentChart.empty
          }
          config={
            {
              cash: {
                label: revCopy.paymentChart.cash,
                theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
              },
              vietqr: {
                label: "VietQR",
                theme: { light: "var(--chart-2)", dark: "var(--chart-2)" },
              },
            } satisfies ChartConfig
          }
          chartClassName="aspect-square max-h-72"
          empty={paymentTotal === 0}
        >
          <PieChart>
            <Pie
              data={paymentData}
              dataKey="value"
              nameKey="key"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {paymentData.map((entry) => (
                <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => [
                formatVND(Number(value ?? 0)),
                item && typeof item.payload === "object" && item.payload != null
                  ? (item.payload as { label: string }).label
                  : "",
              ]}
            />
            <Legend
              formatter={(_value, entry) => {
                const key = entry.dataKey as string;
                const row = paymentData.find((d) => d.key === key);
                return row?.label ?? key;
              }}
            />
          </PieChart>
        </ChartCard>

        <ChartCard
          title={revCopy.branchChart.title}
          description={
            branchActive
              ? revCopy.branchChart.descriptionSingle
              : revCopy.branchChart.descriptionAll
          }
          config={
            {
              revenue: {
                label: revCopy.trendChart.tooltipLabel,
                theme: { light: "var(--chart-1)", dark: "var(--chart-1)" },
              },
            } satisfies ChartConfig
          }
          chartClassName="aspect-square max-h-72"
          empty={branchRows.length === 0 || branchActive}
          emptyLabel={
            branchActive
              ? revCopy.branchChart.emptySingle
              : revCopy.branchChart.emptyData
          }
        >
          <BarChart
            data={branchRows.slice(0, 8)}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatVND(v)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              formatter={(value) => [
                formatVND(Number(value ?? 0)),
                revCopy.trendChart.tooltipLabel,
              ]}
            />
            <Bar
              dataKey="revenue"
              fill="var(--color-revenue)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartCard>
      </div>
    </>
  );
}
