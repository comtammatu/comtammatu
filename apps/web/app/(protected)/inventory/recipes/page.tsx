import {
  fetchRecipes,
  fetchMenuItemsForRecipes,
  fetchBranchWacMap,
} from "../procurement-actions";
import { fetchIngredients } from "../ingredient-actions";
import { formatDate } from "../_lib/format";
import { RecipesClient } from "./recipes-client";
import type { RecipeRow, RecipeItem } from "./recipes-client";
import type { MenuItemOption, IngredientOption } from "./recipe-line-dialog";

type MenuItemRow = {
  id: number;
  name: string;
  updated_at: string | null;
  menu_categories: { name: string } | null;
  recipes: Array<{
    ingredient_id: number | null;
    quantity: number | string | null;
    unit: string | null;
    note: string | null;
    yield_factor: number | string | null;
    ingredients: {
      id: number;
      name: string;
      unit: string;
      purchase_unit?: string | null;
      unit_cost: number | string | null;
    } | null;
  }> | null;
};

export default async function RecipesPage() {
  const [recipesRes, menuItemsRes, ingredientsRes, wacRes] = await Promise.all([
    fetchRecipes(),
    fetchMenuItemsForRecipes(),
    fetchIngredients(),
    fetchBranchWacMap(),
  ]);

  const dbRows = recipesRes.success ? (recipesRes.data as MenuItemRow[]) : [];
  const wacMap = (wacRes.success ? wacRes.data : {}) as Record<string, number>;

  const recipes: RecipeRow[] = dbRows
    .filter((row) => (row.recipes ?? []).length > 0)
    .map((row) => {
      const items: RecipeItem[] = (row.recipes ?? []).map((line) => {
        const qty = Number(line.quantity ?? 0);
        const ingredientId = line.ingredients?.id ?? line.ingredient_id ?? 0;
        // WAC (average received branch cost) takes precedence over unit_cost.
        const wac = wacMap[String(ingredientId)];
        const unitCost =
          wac != null ? wac : Number(line.ingredients?.unit_cost ?? 0);
        return {
          ingredientId,
          ingredientName: line.ingredients?.name ?? "—",
          qty,
          unit:
            line.unit ??
            line.ingredients?.purchase_unit ??
            line.ingredients?.unit ??
            "",
          yieldFactor: Number(line.yield_factor ?? 1),
          note: line.note ?? null,
          lineCost: qty * unitCost,
        };
      });

      const estimatedCost = items.reduce((sum, i) => sum + i.lineCost, 0);

      return {
        id: row.id,
        menuItemId: row.id,
        name: row.name,
        category: row.menu_categories?.name ?? "",
        updatedAt: row.updated_at ? formatDate(row.updated_at) : "—",
        estimatedCost,
        items,
      };
    });

  const menuItems: MenuItemOption[] = menuItemsRes.success
    ? (menuItemsRes.data as Array<{ id: number; name: string }>).map((mi) => ({
        id: mi.id,
        name: mi.name,
      }))
    : [];

  const ingredients: IngredientOption[] = ingredientsRes.success
    ? (
        ingredientsRes.data as Array<{
          id: number;
          name: string;
          unit: string;
          purchase_unit?: string | null;
        }>
      ).map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.purchase_unit ?? i.unit,
      }))
    : [];

  return (
    <RecipesClient
      recipes={recipes}
      menuItems={menuItems}
      ingredients={ingredients}
    />
  );
}
