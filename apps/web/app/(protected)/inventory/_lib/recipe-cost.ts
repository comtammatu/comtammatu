import type { IngredientUnitRow } from "@lib/inventory/types";

type RecipeLineBaseQuantityInput = {
  quantity: number;
  entryUnitId: number | null;
  units?: readonly IngredientUnitRow[] | null;
};

export function getRecipeLineBaseQuantity({
  quantity,
  entryUnitId,
  units,
}: RecipeLineBaseQuantityInput): number {
  const safeQuantity =
    Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

  if (entryUnitId == null) {
    return safeQuantity;
  }

  const entryUnit = units?.find(
    (unit) => unit.unit_id === entryUnitId && unit.is_active,
  );
  const factor = entryUnit?.to_base_factor;

  if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) {
    return safeQuantity * factor;
  }

  return safeQuantity;
}
