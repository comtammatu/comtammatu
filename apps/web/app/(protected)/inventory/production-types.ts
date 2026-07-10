import type { ProductionRunRow } from "./production-run-actions";
import type { ProductionRecipeRow } from "./production-recipe-actions";
import type { IngredientUnitRow } from "./_lib/types";

export type BranchOption = {
  id: number;
  name: string;
  branchKind?: string | null;
};

export type InventoryLocationOption = {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  branchKind: string | null;
  kind: string | null;
  isDefaultReceive: boolean;
  isDefaultConsumption: boolean;
};

export type IngredientOption = {
  id: number;
  name: string;
  unit: string;
  item_kind: string;
  units?: IngredientUnitRow[];
};

export type FinishedGoodOption = {
  id: number;
  name: string;
  unit: string;
  units?: IngredientUnitRow[];
};

export type RawIngredientOption = {
  id: number;
  name: string;
  unit: string;
  units?: IngredientUnitRow[];
};

export type ProductionRecipeGroup = {
  finishedGoodId: number;
  finishedGoodName: string;
  lines: ProductionRecipeRow[];
};

export function sortFinishedGoods(items: FinishedGoodOption[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function sortRawIngredients(items: RawIngredientOption[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export interface ProductionShortageRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  needed: number;
  on_hand: number;
  missing: number;
}

export function badgeVariantFromTone(
  tone: "neutral" | "warning" | "success" | "danger",
) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  if (tone === "danger") return "destructive" as const;
  return "secondary" as const;
}

export type { ProductionRunRow, ProductionRecipeRow };
