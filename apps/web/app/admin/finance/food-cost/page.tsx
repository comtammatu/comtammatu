import { fetchFoodCost } from "../accounting-actions";
import { FoodCostClient } from "./food-cost-client";

export default async function FoodCostPage() {
  // Default: current month
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = now.toISOString().slice(0, 10);

  const result = await fetchFoodCost({ startDate, endDate });
  const rows = result.success ? ((result.data ?? []) as FoodCostRow[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Chi phí nguyên liệu
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Food cost theo món — doanh thu, chi phí, biên lợi nhuận
        </p>
      </div>
      <FoodCostClient
        initialRows={rows}
        initialStart={startDate}
        initialEnd={endDate}
      />
    </div>
  );
}

export interface FoodCostRow {
  date: string | null;
  branch_id: number | null;
  menu_item_id: number | null;
  item_name: string | null;
  qty_sold: number | null;
  revenue: number | null;
  food_cost: number | null;
}
