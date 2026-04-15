import type {
  ProductionOrderRow,
  ProductionRecipeRow,
} from "./production-actions";

export type BranchOption = {
  id: number;
  name: string;
};

export type IngredientOption = {
  id: number;
  name: string;
  unit: string;
  item_kind: string;
};

export type FinishedGoodOption = {
  id: number;
  name: string;
  unit: string;
};

export type RawIngredientOption = {
  id: number;
  name: string;
  unit: string;
};

export type DraftLine = {
  finishedGoodId: number;
  quantity: string;
  unit: string;
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

export type { ProductionOrderRow, ProductionRecipeRow };
