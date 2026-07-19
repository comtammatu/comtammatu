import type { IngredientUnitRow } from "@lib/inventory/types";

type RecipeLineBaseQuantityInput = {
  quantity: number;
  yieldFactor: number;
  entryUnitId: number | null;
  units?: readonly IngredientUnitRow[] | null;
};

export function getRecipeLineBaseQuantity({
  quantity,
  yieldFactor,
  entryUnitId,
  units,
}: RecipeLineBaseQuantityInput): number {
  const safeQuantity =
    Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const safeYieldFactor =
    Number.isFinite(yieldFactor) && yieldFactor > 0 ? yieldFactor : 1;
  const measuredQuantity = safeQuantity / safeYieldFactor;

  if (entryUnitId == null) {
    return measuredQuantity;
  }

  const entryUnit = units?.find(
    (unit) => unit.unit_id === entryUnitId && unit.is_active,
  );
  const factor = entryUnit?.to_base_factor;

  if (typeof factor === "number" && Number.isFinite(factor) && factor > 0) {
    return measuredQuantity * factor;
  }

  return measuredQuantity;
}
