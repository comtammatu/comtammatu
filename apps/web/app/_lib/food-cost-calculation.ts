import { getRecipeLineBaseQuantity } from "../(protected)/inventory/_lib/recipe-cost";
import type { IngredientUnitRow } from "../(protected)/inventory/_lib/types";

export interface FoodCostSaleLine {
  branchId: number;
  menuItemId: number;
  itemName: string | null;
  quantity: number;
  revenue: number;
}

export interface FoodCostRecipeLine {
  menuItemId: number;
  ingredientId: number;
  quantity: number;
  entryUnitId: number | null;
  yieldFactor: number;
  fallbackUnitCost: number;
  units: IngredientUnitRow[];
}

export interface FoodCostResultRow {
  period_start: string | null;
  branch_id: number;
  menu_item_id: number;
  item_name: string | null;
  quantity_sold: number;
  revenue: number;
  ingredient_cost: number;
  food_cost_pct: number | null;
}

export function foodCostUnitCostKey(
  branchId: number,
  ingredientId: number,
): string {
  return `${branchId}:${ingredientId}`;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function buildFoodCostRows({
  saleLines,
  recipeLines,
  unitCosts,
  periodStart,
}: {
  saleLines: FoodCostSaleLine[];
  recipeLines: FoodCostRecipeLine[];
  unitCosts: ReadonlyMap<string, number>;
  periodStart: string | null;
}): FoodCostResultRow[] {
  const recipesByItem = new Map<number, FoodCostRecipeLine[]>();
  for (const line of recipeLines) {
    const rows = recipesByItem.get(line.menuItemId) ?? [];
    rows.push(line);
    recipesByItem.set(line.menuItemId, rows);
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
        ingredient_cost: 0,
        food_cost_pct: null,
      } satisfies FoodCostResultRow);

    current.quantity_sold += line.quantity;
    current.revenue += line.revenue;
    rows.set(key, current);
  }

  for (const row of rows.values()) {
    const recipeRows = recipesByItem.get(row.menu_item_id) ?? [];
    const costPerUnit = recipeRows.reduce((sum, recipe) => {
      const baseQuantity = getRecipeLineBaseQuantity({
        quantity: recipe.quantity,
        yieldFactor: recipe.yieldFactor,
        entryUnitId: recipe.entryUnitId,
        units: recipe.units,
      });
      const unitCost =
        unitCosts.get(foodCostUnitCostKey(row.branch_id, recipe.ingredientId)) ??
        recipe.fallbackUnitCost;
      return sum + baseQuantity * unitCost;
    }, 0);

    row.ingredient_cost = round2(row.quantity_sold * costPerUnit);
    row.food_cost_pct =
      row.revenue > 0 ? round2((row.ingredient_cost / row.revenue) * 100) : null;
  }

  return Array.from(rows.values()).sort(
    (a, b) => (b.food_cost_pct ?? -1) - (a.food_cost_pct ?? -1),
  );
}
