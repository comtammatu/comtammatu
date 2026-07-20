export interface FoodCostRow {
  period_start: string | null;
  branch_id: number | null;
  menu_item_id: number | null;
  item_name: string | null;
  quantity_sold: number | null;
  revenue: number | null;
  unit_ingredient_cost: number | null;
  ingredient_cost: number | null;
  food_cost_pct: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
}
