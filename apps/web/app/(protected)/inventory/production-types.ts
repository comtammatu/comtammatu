import { INVENTORY_VI } from "@comtammatu/shared/messages";
import type { ProductionRunRow } from "./production-run-actions";
import type { ProductionRecipeRow } from "./production-recipe-actions";
import type { IngredientUnitRow } from "./_lib/types";

export type BranchOption = {
  id: number;
  name: string;
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

export type ProductionReadinessState =
  | "missing-production-branch"
  | "missing-finished-good"
  | "missing-raw-material"
  | "missing-recipe"
  | null;

export interface ProductionReadinessSummary {
  readinessState: ProductionReadinessState;
  readinessMessage: string | null;
  actionsEnabled: boolean;
  sortedFinishedGoods: FinishedGoodOption[];
  sortedRawIngredients: RawIngredientOption[];
}

export function sortFinishedGoods(items: FinishedGoodOption[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function sortRawIngredients(items: RawIngredientOption[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function getProductionReadinessSummary({
  productionBranches,
  ingredients,
  finishedGoods,
  recipes,
}: {
  productionBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  recipes?: ProductionRecipeRow[];
}): ProductionReadinessSummary {
  const sortedFinishedGoods = sortFinishedGoods(finishedGoods);
  const sortedRawIngredients = sortRawIngredients(
    ingredients
      .filter(
        (ingredient) =>
          ingredient.item_kind === "raw_material" ||
          ingredient.item_kind === "finished_good",
      )
      .map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
      })),
  );

  const readinessState: ProductionReadinessState =
    productionBranches.length === 0
      ? "missing-production-branch"
      : sortedFinishedGoods.length === 0
        ? "missing-finished-good"
        : sortedRawIngredients.length === 0
          ? "missing-raw-material"
          : (recipes?.length ?? 0) === 0
            ? "missing-recipe"
            : null;

  const readinessMessage =
    readinessState === "missing-production-branch"
      ? INVENTORY_VI.productionReadinessNoBranch
      : readinessState === "missing-finished-good"
        ? INVENTORY_VI.productionReadinessNoFinishedGood
        : readinessState === "missing-raw-material"
          ? INVENTORY_VI.productionReadinessNoRawMaterial
          : readinessState === "missing-recipe"
            ? INVENTORY_VI.productionReadinessNoRecipe
            : null;

  return {
    readinessState,
    readinessMessage,
    actionsEnabled: readinessState === null,
    sortedFinishedGoods,
    sortedRawIngredients,
  };
}

export interface ProductionShortageRow {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  needed: number;
  on_hand: number;
  missing: number;
}

export const PRODUCTION_ERROR_CODES = {
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
} as const;

export function orderStatusLabel(status: string) {
  if (status === "draft") return "Nháp";
  if (status === "completed") return "Đã hoàn tất";
  if (status === "cancelled") return "Đã hủy";
  return status;
}

export function orderStatusTone(
  status: string,
): "neutral" | "warning" | "success" | "danger" {
  if (status === "completed") return "success";
  if (status === "cancelled") return "danger";
  return "warning";
}

export function badgeVariantFromTone(
  tone: "neutral" | "warning" | "success" | "danger",
) {
  if (tone === "success") return "success" as const;
  if (tone === "warning") return "warning" as const;
  if (tone === "danger") return "destructive" as const;
  return "secondary" as const;
}

export function defaultProductionNumber() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PRD-${stamp}-${suffix}`;
}

export type { ProductionRunRow, ProductionRecipeRow };
