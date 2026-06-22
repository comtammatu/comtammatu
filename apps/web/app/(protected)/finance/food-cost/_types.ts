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
