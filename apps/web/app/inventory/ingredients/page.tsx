import { fetchIngredients } from "../actions";
import { IngredientsClient } from "./ingredients-client";
import type { IngredientRow } from "./ingredient-dialog";

export default async function IngredientsPage() {
  const result = await fetchIngredients();

  const initial: IngredientRow[] = result.success
    ? (result.data as IngredientRow[])
    : [];

  return <IngredientsClient initial={initial} />;
}
