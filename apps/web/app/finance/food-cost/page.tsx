import { Card, CardContent } from "@comtammatu/ui/components/card";
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
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Tài chính
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Chi phí nguyên liệu
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <FoodCostClient
        initialRows={rows}
        initialStart={startDate}
        initialEnd={endDate}
      />
    </div>
  );
}

export interface FoodCostRow {
  period_start: string | null;
  branch_id: number | null;
  menu_item_id: number | null;
  item_name: string | null;
  quantity_sold: number | null;
  revenue: number | null;
  ingredient_cost: number | null;
  food_cost_pct: number | null;
}
