import { fetchIngredients } from "@/inventory/actions";
import {
  fetchMenuItemsForRecipes,
  fetchRecipes,
} from "@/inventory/procurement-actions";
import { Card, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { tRoute } from "../../_lib/dictionary";
import { formatDate } from "../../_lib/format";
import { RecipesClient } from "../../recipes/recipes-client";
import type { RecipeRow, RecipeItem } from "../../recipes/recipes-client";
import type {
  MenuItemOption,
  IngredientOption,
} from "../../recipes/recipe-line-dialog";

export default async function RecipesSettingsPage() {
  const [recRes, menuRes, ingRes] = await Promise.all([
    fetchRecipes(),
    fetchMenuItemsForRecipes(),
    fetchIngredients(),
  ]);
  const dbRows = recRes.success
    ? (recRes.data as Array<Record<string, unknown>>)
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

  const menuItems: MenuItemOption[] = menuRes.success
    ? (menuRes.data as Array<{ id: number; name: string }>).map((mi) => ({
        id: mi.id,
        name: mi.name,
      }))
    : [];

  const ingredients: IngredientOption[] = ingRes.success
    ? (ingRes.data as Array<{ id: number; name: string; unit: string }>).map(
        (ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
        }),
      )
    : [];

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-2xl">
            {tRoute("/inventory/settings/recipes", "heading")}
          </CardTitle>
        </CardHeader>
      </Card>
      <RecipesClient
        recipes={recipes}
        menuItems={menuItems}
        ingredients={ingredients}
      />
    </div>
  );
}
