import { fetchRecipes, fetchMenuItemsForRecipes } from "../procurement-actions";
import { fetchIngredients } from "../actions";
import { formatDate } from "../_lib/format";
import { RecipesClient } from "./recipes-client";
import type { RecipeRow, RecipeItem } from "./recipes-client";
import type { MenuItemOption, IngredientOption } from "./recipe-line-dialog";

export default async function RecipesPage() {
  const [recipesRes, menuItemsRes, ingredientsRes] = await Promise.all([
    fetchRecipes(),
    fetchMenuItemsForRecipes(),
    fetchIngredients(),
  ]);

  const dbRows = recipesRes.success
    ? (recipesRes.data as Array<Record<string, unknown>>)
    : [];

  const recipes: RecipeRow[] = dbRows.map((row) => {
    const lineItems =
      (row.recipe_items as Array<Record<string, unknown>>) ?? [];

    const items: RecipeItem[] = lineItems.map((li) => ({
      ingredientId:
        ((li.ingredients as Record<string, unknown>)?.id as number) ?? 0,
      ingredientName:
        ((li.ingredients as Record<string, unknown>)?.name as string) ?? "—",
      qty: Number(li.quantity ?? 0),
      unit: (li.unit as string) ?? "",
      yieldFactor: Number(li.yield_factor ?? 100),
      note: (li.note as string) ?? null,
    }));

    return {
      id: row.id as number,
      menuItemId: (row.menu_item_id as number) ?? 0,
      name: (row.name as string) ?? "",
      category: (row.category as string) ?? "",
      updatedAt: row.updated_at ? formatDate(row.updated_at as string) : "—",
      estimatedCost: Number(row.estimated_cost ?? 0),
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
        ingredientsRes.data as Array<{ id: number; name: string; unit: string }>
      ).map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
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
