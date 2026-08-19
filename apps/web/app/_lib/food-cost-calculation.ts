import { getMenuRecipeLineBaseQuantity } from "../(protected)/inventory/_lib/menu-recipe-cost";
import type { IngredientUnitRow } from "@lib/inventory/types";

export interface FoodCostSaleLine {
  branchId: number;
  menuItemId: number;
  itemName: string | null;
  quantity: number;
  revenue: number;
}

/** Live recipes; live catalog names. POS `order_items.item_name` is a sale snapshot. */
export function overlayCatalogItemNames(
  saleLines: readonly FoodCostSaleLine[],
  catalogNames: ReadonlyMap<number, string>,
): FoodCostSaleLine[] {
  return saleLines.map((line) => {
    const catalogName = catalogNames.get(line.menuItemId)?.trim();
    if (!catalogName || catalogName === line.itemName) return line;
    return { ...line, itemName: catalogName };
  });
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
  branch_id: number | null;
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

export function summarizeFoodCostRows(
  rows: readonly {
    quantity_sold: number | null;
    revenue: number | null;
    ingredient_cost: number | null;
  }[],
): {
  quantitySold: number;
  revenue: number;
  ingredientCost: number | null;
  unitIngredientCost: number | null;
} {
  let quantitySold = 0;
  let revenue = 0;
  let ingredientCost = 0;
  let missingCost = false;
  for (const row of rows) {
    quantitySold += Number(row.quantity_sold ?? 0);
    revenue += Number(row.revenue ?? 0);
    if (row.ingredient_cost == null) {
      missingCost = true;
      continue;
    }
    ingredientCost += Number(row.ingredient_cost);
  }
  if (missingCost) {
    return {
      quantitySold,
      revenue: round2(revenue),
      ingredientCost: null,
      unitIngredientCost: null,
    };
  }
  const roundedCost = round2(ingredientCost);
  const roundedRevenue = round2(revenue);
  return {
    quantitySold,
    revenue: roundedRevenue,
    ingredientCost: roundedCost,
    unitIngredientCost:
      quantitySold > 0 ? round2(roundedCost / quantitySold) : null,
  };
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
    // Recipe implied complement of food_cost_pct — not finance.gross_margin.
    row.gross_margin_pct =
      row.revenue > 0 ? round2((row.gross_profit / row.revenue) * 100) : null;
  }

  return Array.from(rows.values()).sort(
    (a, b) => (b.food_cost_pct ?? -1) - (a.food_cost_pct ?? -1),
  );
}

/** One row per sold item — never repeat the same món across Chi nhánh. */
export function aggregateFoodCostRowsByMenuItem(
  rows: readonly FoodCostResultRow[],
): FoodCostResultRow[] {
  const byItem = new Map<string, FoodCostResultRow>();
  for (const row of rows) {
    const key =
      row.menu_item_id > 0
        ? `id:${row.menu_item_id}`
        : `name:${row.item_name ?? ""}`;
    const current = byItem.get(key);
    if (!current) {
      byItem.set(key, { ...row });
      continue;
    }
    current.branch_id = null;
    current.quantity_sold += row.quantity_sold;
    current.revenue += row.revenue;
    if (current.ingredient_cost == null || row.ingredient_cost == null) {
      current.ingredient_cost = null;
      current.unit_ingredient_cost = null;
      current.food_cost_pct = null;
      current.gross_profit = null;
      current.gross_margin_pct = null;
      continue;
    }
    current.ingredient_cost = round2(
      current.ingredient_cost + row.ingredient_cost,
    );
    current.unit_ingredient_cost =
      current.quantity_sold > 0
        ? round2(current.ingredient_cost / current.quantity_sold)
        : current.unit_ingredient_cost;
    if (current.gross_profit != null && row.gross_profit != null) {
      current.gross_profit = round2(current.gross_profit + row.gross_profit);
    } else {
      current.gross_profit = null;
    }
    current.food_cost_pct =
      current.revenue > 0
        ? round2((current.ingredient_cost / current.revenue) * 100)
        : null;
    current.gross_margin_pct =
      current.gross_profit != null && current.revenue > 0
        ? round2((current.gross_profit / current.revenue) * 100)
        : null;
  }
  return Array.from(byItem.values()).sort(
    (a, b) => (b.food_cost_pct ?? -1) - (a.food_cost_pct ?? -1),
  );
}
