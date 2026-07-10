import { fetchFoodCost } from "@/_lib/food-cost-actions";
import {
  fetchApAging,
  fetchConsumptionVariance,
  fetchStockMovementReport,
} from "../report-actions";
import {
  getVNDateString,
  getVNMonthSequenceBack,
  getVNMonthStartDateString,
} from "@comtammatu/shared/time";
import { formatPercent } from "@comtammatu/shared/format";
import { ReportsClient } from "./reports-client";
import type { ApAgingItem, VarianceItem } from "./reports-client";
import type { InventorySemanticColor } from "../_lib/ui";

type MovementSummaryItem = {
  label: string;
  values: { value: number; color: InventorySemanticColor }[];
};

function buildFoodCostTrend(
  rows: Array<{
    period_start: string;
    revenue: number;
    ingredient_cost: number;
  }>,
  months = 12,
) {
  const monthKeys = getVNMonthSequenceBack(months)
    .reverse()
    .map(({ date }) => date.slice(0, 7));
  const buckets = new Map<string, { revenue: number; foodCost: number }>();

  for (const row of rows) {
    const monthKey = row.period_start.slice(0, 7);
    const bucket = buckets.get(monthKey) ?? { revenue: 0, foodCost: 0 };
    bucket.revenue += Number(row.revenue ?? 0);
    bucket.foodCost += Number(row.ingredient_cost ?? 0);
    buckets.set(monthKey, bucket);
  }

  const trend: number[] = [];
  for (const key of monthKeys) {
    const bucket = buckets.get(key);
    const ratio =
      bucket && bucket.revenue > 0
        ? (bucket.foodCost / bucket.revenue) * 100
        : 0;
    trend.push(Number(ratio.toFixed(1)));
  }

  return trend;
}

function calculateTrendDeltaPct(trend: number[]) {
  if (trend.length < 2) return null;
  const current = trend[trend.length - 1] ?? 0;
  const previous = trend[trend.length - 2] ?? 0;
  if (previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export async function ReportsPageContent() {
  const startDate = getVNMonthStartDateString();
  const endDate = getVNDateString();
  const trendStartDate = getVNMonthSequenceBack(12).at(-1)?.date ?? startDate;

  const [apRes, varRes, movementRes, foodCostRes] = await Promise.all([
    fetchApAging(),
    fetchConsumptionVariance({ startDate, endDate }),
    fetchStockMovementReport({ startDate, endDate }),
    fetchFoodCost({
      startDate: trendStartDate,
      endDate,
    }),
  ]);

  let apAging: ApAgingItem[] = [];
  if (apRes.success && apRes.data) {
    const rows = apRes.data as Array<{
      buckets: {
        current: { total: number };
        days_1_30: { total: number };
        days_31_60: { total: number };
        days_61_90: { total: number };
        days_over_90: { total: number };
      };
      total_outstanding: number;
    }>;
    let current = 0;
    let d1_30 = 0;
    let d31_60 = 0;
    let d61_90 = 0;
    let dOver90 = 0;
    for (const row of rows) {
      current += row.buckets.current.total;
      d1_30 += row.buckets.days_1_30.total;
      d31_60 += row.buckets.days_31_60.total;
      d61_90 += row.buckets.days_61_90.total;
      dOver90 += row.buckets.days_over_90.total;
    }
    apAging = [
      { range: "0 – 30 ngày", amount: Math.round(current + d1_30) },
      { range: "31 – 60 ngày", amount: Math.round(d31_60) },
      { range: "61 – 90 ngày", amount: Math.round(d61_90) },
      { range: "> 90 ngày", amount: Math.round(dOver90) },
    ];
  }

  let consumptionVariance: VarianceItem[] = [];
  if (varRes.success && varRes.data) {
    const rows = varRes.data as Array<{
      ingredient_name: string;
      variance_pct: number;
    }>;
    consumptionVariance = rows.slice(0, 5).map((r) => ({
      name: r.ingredient_name,
      actual: `${r.variance_pct > 0 ? "+" : ""}${formatPercent(r.variance_pct)}`,
      trend: (r.variance_pct >= 0 ? "up" : "down") as "up" | "down",
    }));
  }

  const movementRows =
    movementRes.success && movementRes.data
      ? (movementRes.data as Array<{
          grn_receipt: number;
          transfer_in: number;
          transfer_out: number;
          consumption: number;
          production_consumption: number;
          production_output: number;
          adjustment: number;
        }>)
      : [];

  const movementTotals = movementRows.reduce(
    (acc, row) => {
      acc.grnReceipt += Number(row.grn_receipt ?? 0);
      acc.transferIn += Number(row.transfer_in ?? 0);
      acc.transferOut += Math.abs(Number(row.transfer_out ?? 0));
      acc.consumption += Math.abs(Number(row.consumption ?? 0));
      acc.productionConsumption += Math.abs(
        Number(row.production_consumption ?? 0),
      );
      acc.productionOutput += Number(row.production_output ?? 0);
      acc.adjustment += Math.abs(Number(row.adjustment ?? 0));
      return acc;
    },
    {
      grnReceipt: 0,
      transferIn: 0,
      transferOut: 0,
      consumption: 0,
      productionConsumption: 0,
      productionOutput: 0,
      adjustment: 0,
    },
  );

  const movementSummary: MovementSummaryItem[] = [
    {
      label: "Nhập kho",
      values: [{ value: movementTotals.grnReceipt, color: "primary" }],
    },
    {
      label: "Chuyển vào",
      values: [{ value: movementTotals.transferIn, color: "success" }],
    },
    {
      label: "Xuất / tiêu hao",
      values: [
        { value: movementTotals.transferOut, color: "danger" },
        { value: movementTotals.consumption, color: "warning" },
        {
          value: movementTotals.productionConsumption,
          color: "info",
        },
      ],
    },
    {
      label: "Sản xuất",
      values: [{ value: movementTotals.productionOutput, color: "info" }],
    },
  ];

  const foodCostRows =
    foodCostRes.success && foodCostRes.data
      ? (foodCostRes.data as Array<{
          period_start: string;
          revenue: number;
          ingredient_cost: number;
        }>)
      : [];
  const foodCostTrendAvailable = foodCostRows.length > 0;
  const foodCostTrend = buildFoodCostTrend(foodCostRows);
  const foodCostTrendDeltaPct = calculateTrendDeltaPct(foodCostTrend);

  return (
    <ReportsClient
      movementSummary={movementSummary}
      apAging={apAging}
      consumptionVariance={consumptionVariance}
      foodCostTrend={foodCostTrend}
      foodCostTrendAvailable={foodCostTrendAvailable}
      foodCostTrendDeltaPct={foodCostTrendDeltaPct}
    />
  );
}

export default async function ReportsPage() {
  return <ReportsPageContent />;
}
