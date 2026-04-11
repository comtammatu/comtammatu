import { fetchRecipes } from "../procurement-actions";
import { formatDate } from "../_lib/format";
import { RecipesClient } from "./recipes-client";
import type { RecipeRow, RecipeItem } from "./recipes-client";

export default async function RecipesPage() {
  const res = await fetchRecipes();
  const dbRows = res.success
    ? (res.data as Array<Record<string, unknown>>)
    : [];

  const recipes: RecipeRow[] = dbRows.map((row) => {
    const lineItems =
      (row.recipe_items as Array<Record<string, unknown>>) ?? [];

    const items: RecipeItem[] = lineItems.map((li) => ({
      ingredientName:
        ((li.ingredients as Record<string, unknown>)?.name as string) ?? "—",
      qty: Number(li.quantity ?? 0),
      unit: (li.unit as string) ?? "",
      yieldFactor: Number(li.yield_factor ?? 100),
      note: (li.note as string) ?? null,
    }));

    return {
      id: row.id as number,
      name: (row.name as string) ?? "",
      category: (row.category as string) ?? "",
      updatedAt: row.updated_at ? formatDate(row.updated_at as string) : "—",
      estimatedCost: Number(row.estimated_cost ?? 0),
      items,
    };
  });

  return <RecipesClient recipes={recipes} />;
}
