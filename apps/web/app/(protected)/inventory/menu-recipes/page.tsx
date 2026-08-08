import {
  fetchMenuRecipes,
  fetchMenuItemsForMenuRecipes,
  fetchBranchWacMap,
  fetchBranchMenuStockCapacity,
} from "../menu-recipe-actions";
import { fetchIngredients } from "../ingredient-actions";
import {
  buildAccessDeniedPath,
  INVENTORY_CATALOG_ROLES,
} from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../_lib/inventory-scope";
import { formatDate } from "@lib/inventory/format";
import {
  getMenuRecipeLineBaseQuantity,
  resolveMenuRecipeUnitCost,
  sumMenuRecipeEstimatedCost,
} from "../_lib/menu-recipe-cost";
import { getIngredientUnitDisplayName } from "../_lib/unit-display";
import { MenuRecipesClient } from "./menu-recipes-client";
import type { MenuRecipeRow, MenuRecipeItem } from "./menu-recipes-client";
import type {
  MenuItemOption,
  IngredientOption,
} from "./menu-recipe-line-dialog";
import type { IngredientUnitRow } from "@lib/inventory/types";

type MenuItemRow = {
  id: number;
  name: string;
  updated_at: string | null;
  menu_categories: { name: string } | null;
  menu_recipes: Array<{
    ingredient_id: number | null;
    quantity: number | string | null;
    entry_unit_id: number | string | null;
    note: string | null;
    ingredients: {
      id: number;
      name: string;
      ingredient_units?: { is_base: boolean; units: { code: string } | null }[];
      monetary: { unitCost: number | null };
    } | null;
  }> | null;
};

export default async function MenuRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { supabase, claims } = await loadAuthState();
  if (!INVENTORY_CATALOG_ROLES.includes(claims.user_role)) {
    redirect(
      buildAccessDeniedPath("insufficient-permission", {
        from: "/inventory/menu-recipes",
      }),
    );
  }
  const params = await searchParams;
  const requested = await resolveRequestedBranchId(params.branchId);
  const scope = await resolveInventoryBranchScope(supabase, claims, requested);
  const branchId = scope.selectedBranchId;

  const [recipesRes, menuItemsRes, ingredientsRes, wacRes, stockCapacityRes] =
    await Promise.all([
      fetchMenuRecipes(),
      fetchMenuItemsForMenuRecipes(),
      fetchIngredients(),
      // Portion cost is a catalog estimate: use any valued stock-bearing site.
      fetchBranchWacMap(null),
      branchId != null
        ? fetchBranchMenuStockCapacity(branchId)
        : Promise.resolve({ success: true as const, data: {} }),
    ]);

  const dbRows = recipesRes.success ? (recipesRes.data as MenuItemRow[]) : [];

  const wacMap = (
    wacRes.success ? (wacRes.data?.monetary ?? {}) : {}
  ) as Record<string, number>;
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
        ingredient_units?: {
          is_base: boolean;
          units: { code: string } | null;
        }[];
        units?: IngredientUnitRow[];
      }>)
    : [];
  const ingredientById = new Map(
    ingredientRows.map((ingredient) => [ingredient.id, ingredient]),
  );

  const menuRecipes: MenuRecipeRow[] = dbRows
    .map((row) => {
      const items: MenuRecipeItem[] = (row.menu_recipes ?? []).map((line) => {
        const qty = Number(line.quantity ?? 0);
        const ingredientId = line.ingredients?.id ?? line.ingredient_id ?? 0;
        const unitCost = resolveMenuRecipeUnitCost({
          valuedWac: wacMap[String(ingredientId)],
          referenceUnitCost: line.ingredients?.monetary?.unitCost,
        });
        const entryUnitId =
          line.entry_unit_id == null ? null : Number(line.entry_unit_id);
        const catalogIngredient = ingredientById.get(ingredientId);
        const baseQuantity = getMenuRecipeLineBaseQuantity({
          quantity: qty,
          entryUnitId,
          units: catalogIngredient?.units,
        });
        const fallbackUnit =
          line.ingredients?.ingredient_units?.find((u) => u.is_base)?.units
            ?.code ?? "";
        return {
          ingredientId,
          ingredientName: line.ingredients?.name ?? "—",
          qty,
          unitLabel: getIngredientUnitDisplayName(
            catalogIngredient?.units,
            entryUnitId,
            fallbackUnit,
          ),
          entryUnitId,
          note: line.note ?? null,
          lineCost:
            unitCost == null ? null : baseQuantity * unitCost,
        };
      });

      const estimatedCost = sumMenuRecipeEstimatedCost(
        items.map((item) => item.lineCost),
      );

      return {
        id: row.id,
        menuItemId: row.id,
        name: row.name,
        category: row.menu_categories?.name ?? "",
        updatedAt: row.updated_at ? formatDate(row.updated_at) : "—",
        estimatedCost,
        items,
      };
    })
    .filter((menuRecipe) => menuRecipe.items.length > 0);

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
        unitLabel: i.units?.find((u) => u.is_base)?.unit_code ?? "",
        units: i.units,
      }))
    : [];

  return (
    <MenuRecipesClient
      menuRecipes={menuRecipes}
      menuItems={menuItems}
      ingredients={ingredients}
      loadError={loadError || null}
      stockCapacityByMenuItemId={stockCapacityByMenuItemId}
    />
  );
}
