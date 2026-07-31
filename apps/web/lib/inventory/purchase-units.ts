import type { IngredientUnitRow } from "./types";
import {
  getIngredientRoleUnit,
  getRoleUnitOptions,
  type InventoryUnitOption,
} from "./unit-options";

export type PurchaseUnitOption = InventoryUnitOption;

// Structurally accepts IngredientRow plus any narrower ingredient shape that
// still carries `units` (e.g. GRN create-from-supplier's local Ingredient type).
type IngredientWithUnits = {
  units?: IngredientUnitRow[];
  receipt_unit_id?: number | null;
  issue_unit_id?: number | null;
};

/**
 * Selectable GRN/purchase entry units: configured receipt and issue roles.
 * Production-only units are excluded.
 */
export function getPurchaseUnitOptions(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption[] {
  return getRoleUnitOptions(ingredient, ["receipt", "issue"]);
}

export function getDefaultPurchaseUnit(
  ingredient: IngredientWithUnits | undefined,
): PurchaseUnitOption | null {
  return getIngredientRoleUnit(ingredient, "receipt");
}
