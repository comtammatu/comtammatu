import { fetchIngredients } from "../actions";
import { fetchMenuItemsForRecipes, fetchRecipes } from "../procurement-actions";
import { RecipesClient } from "./recipes-client";
import type { IngredientRow } from "../page";

export default async function RecipesPage() {
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
    <RecipesClient
      initial={initial as never}
      menuItems={menuItems as never}
      ingredients={ingredients}
    />
  );
}
