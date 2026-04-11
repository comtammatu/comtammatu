import { fetchApAging } from "../report-actions";
import { fetchConsumptionVariance } from "../report-actions";
import { ReportsClient } from "./reports-client";
import type { ApAgingItem, VarianceItem } from "./reports-client";

export default async function ReportsPage() {
  const today = new Date();
  const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [apRes, varRes] = await Promise.all([
    fetchApAging(),
    fetchConsumptionVariance({ startDate, endDate }),
  ]);

  // Map AP Aging buckets
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
    // Aggregate all suppliers into aging buckets
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

  // Map Consumption Variance
  let consumptionVariance: VarianceItem[] = [];
  if (varRes.success && varRes.data) {
    const rows = varRes.data as Array<{
      ingredient_name: string;
      variance_pct: number;
    }>;
    consumptionVariance = rows.slice(0, 5).map((r) => ({
      name: r.ingredient_name,
      actual: `${r.variance_pct > 0 ? "+" : ""}${String(r.variance_pct)}%`,
      trend: (r.variance_pct >= 0 ? "up" : "down") as "up" | "down",
    }));
  }

  return (
    <ReportsClient
      apAging={apAging}
      consumptionVariance={consumptionVariance}
    />
  );
}
