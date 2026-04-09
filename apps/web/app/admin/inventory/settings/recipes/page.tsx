import { fetchIngredients } from "../../actions";
import {
  fetchMenuItemsForRecipes,
  fetchRecipes,
} from "../../procurement-actions";
import { RecipesClient } from "../../recipes/recipes-client";
import { PageHeader } from "@/components/foundation/ui-patterns";
import type { IngredientRow } from "../../page";

export default async function RecipesSettingsPage() {
  const [recRes, menuRes, ingRes] = await Promise.all([
    fetchRecipes(),
    fetchMenuItemsForRecipes(),
    fetchIngredients(),
  ]);
  const initial = recRes.success ? (recRes.data ?? []) : [];
  const menuItems = menuRes.success ? (menuRes.data ?? []) : [];
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Công thức"
        description="Quản lý định mức nguyên liệu cho từng món"
      />
      <RecipesClient
        initial={initial as never}
        menuItems={menuItems as never}
        ingredients={ingredients}
      />
    </div>
  );
}
