import { getMenuRecipeLineBaseQuantity } from "../(protected)/inventory/_lib/menu-recipe-cost";
import type { IngredientUnitRow } from "@lib/inventory/types";

export interface FoodCostSaleLine {
  branchId: number;
  menuItemId: number;
  itemName: string | null;
  quantity: number;
  revenue: number;
}

export interface FoodCostMenuRecipeLine {
  menuItemId: number;
  ingredientId: number;
  quantity: number;
  entryUnitId: number | null;
  /** Catalog resolver; null means the line is unvalued. */
  resolvedUnitCost: number | null;
  units: IngredientUnitRow[];
}

export interface FoodCostResultRow {
  period_start: string | null;
  branch_id: number;
  menu_item_id: number;
  item_name: string | null;
  quantity_sold: number;
  revenue: number;
  unit_ingredient_cost: number | null;
  ingredient_cost: number | null;
  food_cost_pct: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function buildFoodCostRows({
  saleLines,
  menuRecipeLines,
  periodStart,
}: {
  saleLines: FoodCostSaleLine[];
  menuRecipeLines: FoodCostMenuRecipeLine[];
  periodStart: string | null;
}): FoodCostResultRow[] {
  const menuRecipesByItem = new Map<number, FoodCostMenuRecipeLine[]>();
  for (const line of menuRecipeLines) {
    const rows = menuRecipesByItem.get(line.menuItemId) ?? [];
    rows.push(line);
    menuRecipesByItem.set(line.menuItemId, rows);
  }

  const rows = new Map<string, FoodCostResultRow>();
  for (const line of saleLines) {
    const key = `${line.branchId}:${line.menuItemId}`;
    const current =
      rows.get(key) ??
      ({
        period_start: periodStart,
        branch_id: line.branchId,
        menu_item_id: line.menuItemId,
        item_name: line.itemName,
        quantity_sold: 0,
        revenue: 0,
        unit_ingredient_cost: 0,
        ingredient_cost: 0,
        food_cost_pct: null,
        gross_profit: 0,
        gross_margin_pct: null,
      } satisfies FoodCostResultRow);

    current.quantity_sold += line.quantity;
    current.revenue += line.revenue;
    rows.set(key, current);
  }

  for (const row of rows.values()) {
    const menuRecipeRows = menuRecipesByItem.get(row.menu_item_id) ?? [];
    if (menuRecipeRows.length === 0) {
      row.unit_ingredient_cost = 0;
      row.ingredient_cost = 0;
      row.food_cost_pct =
        row.revenue > 0 ? round2((0 / row.revenue) * 100) : null;
      row.gross_profit = round2(row.revenue);
      row.gross_margin_pct =
        row.revenue > 0 ? round2((row.revenue / row.revenue) * 100) : null;
      continue;
    }

    let missingCost = false;
    const costPerUnit = menuRecipeRows.reduce((sum, menuRecipe) => {
      if (menuRecipe.resolvedUnitCost == null) {
        missingCost = true;
        return sum;
      }
      const baseQuantity =
        getMenuRecipeLineBaseQuantity({
          quantity: menuRecipe.quantity,
          entryUnitId: menuRecipe.entryUnitId,
          units: menuRecipe.units,
        }) ?? 0;
      return sum + baseQuantity * menuRecipe.resolvedUnitCost;
    }, 0);

    if (missingCost) {
      row.unit_ingredient_cost = null;
      row.ingredient_cost = null;
      row.food_cost_pct = null;
      row.gross_profit = null;
      row.gross_margin_pct = null;
      continue;
    }

    row.unit_ingredient_cost = round2(costPerUnit);
    row.ingredient_cost = round2(row.quantity_sold * row.unit_ingredient_cost);
    row.food_cost_pct =
      row.revenue > 0
        ? round2((row.ingredient_cost / row.revenue) * 100)
        : null;
    row.gross_profit = round2(row.revenue - row.ingredient_cost);
    row.gross_margin_pct =
      row.revenue > 0 ? round2((row.gross_profit / row.revenue) * 100) : null;
  }

  return Array.from(rows.values()).sort(
    (a, b) => (b.food_cost_pct ?? -1) - (a.food_cost_pct ?? -1),
  );
}
