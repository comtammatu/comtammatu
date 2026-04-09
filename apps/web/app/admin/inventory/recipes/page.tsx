import { fetchIngredients } from "../actions";
import { fetchMenuItemsForRecipes, fetchRecipes } from "../procurement-actions";
import {
  RecipesClient,
  type RecipeRow,
  type MenuItemOpt,
} from "./recipes-client";
import type { IngredientRow } from "../page";

export default async function RecipesPage() {
  const [recRes, menuRes, ingRes] = await Promise.all([
    fetchRecipes(),
    fetchMenuItemsForRecipes(),
    fetchIngredients(),
  ]);
  const initial: RecipeRow[] = recRes.success
    ? ((recRes.data ?? []) as RecipeRow[])
    : [];
  const menuItems: MenuItemOpt[] = menuRes.success
    ? ((menuRes.data ?? []) as MenuItemOpt[])
    : [];
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <RecipesClient
      initial={initial}
      menuItems={menuItems}
      ingredients={ingredients}
    />
  );
}
