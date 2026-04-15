import { fetchFoodCost } from "../accounting-actions";
import {
  PageContainer,
  PageHeader,
} from "@/components/foundation/ui-patterns";
import { FoodCostClient } from "./food-cost-client";

export default async function FoodCostPage() {
  // Default: current month
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = now.toISOString().slice(0, 10);

  const result = await fetchFoodCost({ startDate, endDate });
  const rows = result.success ? ((result.data ?? []) as FoodCostRow[]) : [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Tài chính"
        title="Chi phí nguyên liệu"
      />
      <FoodCostClient
        initialRows={rows}
        initialStart={startDate}
        initialEnd={endDate}
      />
    </PageContainer>
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
