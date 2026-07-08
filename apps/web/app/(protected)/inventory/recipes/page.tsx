import {
  fetchRecipes,
  fetchMenuItemsForRecipes,
  fetchBranchWacMap,
  fetchBranchMenuStockCapacity,
} from "../procurement-actions";
import { fetchIngredients } from "../ingredient-actions";
import { loadAuthState } from "@/_lib/auth";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
import { formatDate } from "../_lib/format";
import { getIngredientUnitDisplayName } from "../_lib/unit-display";
import { RecipesClient } from "./recipes-client";
import type { RecipeRow, RecipeItem } from "./recipes-client";
import type { MenuItemOption, IngredientOption } from "./recipe-line-dialog";
import type { IngredientUnitRow } from "../_lib/types";

type MenuItemRow = {
  id: number;
  name: string;
  updated_at: string | null;
  menu_categories: { name: string } | null;
  recipes: Array<{
    ingredient_id: number | null;
    quantity: number | string | null;
    entry_unit_id: number | string | null;
    note: string | null;
    yield_factor: number | string | null;
    ingredients: {
      id: number;
      name: string;
      ingredient_units?: { is_base: boolean; units: { code: string } | null }[];
      unit_cost: number | string | null;
    } | null;
  }> | null;
};

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { supabase, claims } = await loadAuthState();
  const params = await searchParams;
  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const branchId = scope.selectedBranchId;

  const [recipesRes, menuItemsRes, ingredientsRes, wacRes, stockCapacityRes] =
    await Promise.all([
      fetchRecipes(),
      fetchMenuItemsForRecipes(),
      fetchIngredients(),
      fetchBranchWacMap(),
      branchId != null
        ? fetchBranchMenuStockCapacity(branchId)
        : Promise.resolve({ success: true as const, data: {} }),
      ]);

  const dbRows = recipesRes.success ? (recipesRes.data as MenuItemRow[]) : [];

  const wacMap = (wacRes.success ? wacRes.data : {}) as Record<string, number>;
  const stockCapacityByMenuItemId = (
    stockCapacityRes.success ? stockCapacityRes.data : {}
  ) as Record<string, number>;
  const loadError = [
    !recipesRes.success ? recipesRes.error : null,
    !menuItemsRes.success ? menuItemsRes.error : null,
    !ingredientsRes.success ? ingredientsRes.error : null,
    !wacRes.success ? wacRes.error : null,
    !stockCapacityRes.success ? stockCapacityRes.error : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  const ingredientRows = ingredientsRes.success
    ? (ingredientsRes.data as Array<{
        id: number;
        name: string;
        ingredient_units?: { is_base: boolean; units: { code: string } | null }[];
        units?: IngredientUnitRow[];
      }>)
    : [];
  const ingredientById = new Map(
    ingredientRows.map((ingredient) => [ingredient.id, ingredient]),
  );

  const recipes: RecipeRow[] = dbRows
    .map((row) => {
      const items: RecipeItem[] = (row.recipes ?? []).map((line) => {
        const qty = Number(line.quantity ?? 0);
        const ingredientId = line.ingredients?.id ?? line.ingredient_id ?? 0;
        // WAC (average received branch cost) takes precedence over unit_cost.
        const wac = wacMap[String(ingredientId)];
        const unitCost =
          wac != null ? wac : Number(line.ingredients?.unit_cost ?? 0);
        const entryUnitId =
          line.entry_unit_id == null ? null : Number(line.entry_unit_id);
        const catalogIngredient = ingredientById.get(ingredientId);
        const fallbackUnit =
          line.ingredients?.ingredient_units?.find((u) => u.is_base)?.units?.code ??
          "";
        return {
          ingredientId,
          ingredientName: line.ingredients?.name ?? "—",
          qty,
          unit: getIngredientUnitDisplayName(
            catalogIngredient?.units,
            entryUnitId,
            fallbackUnit,
          ),
          entryUnitId,
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
    ? ingredientRows.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.units?.find((u) => u.is_base)?.unit_code ?? "",
        units: i.units,
      }))
    : [];

  return (
    <RecipesClient
      recipes={recipes}
      menuItems={menuItems}
      ingredients={ingredients}
      loadError={loadError || null}
      stockCapacityByMenuItemId={stockCapacityByMenuItemId}
    />
  );
}
