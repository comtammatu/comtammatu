import { formatVNDate } from "@comtammatu/shared/time";
import type { IngredientUnitRow } from "@/(protected)/inventory/_lib/types";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";

export const STOCK_ALL_CATEGORY_VALUE = "all";
export const STOCK_NO_CATEGORY_VALUE = "__none__";

export type StockStatus = "normal" | "low" | "out" | "over";
export type StockFilter = "all" | "in_stock" | "low" | "out";
export type StockLocationFilter = "all" | "warehouse" | "kitchen";

export type StockLocationBreakdown = {
  locationId: number;
  name: string;
  code: string;
  locationKind: string;
  qty: number;
  avgUnitCost: number | null;
  lastCountedAt: string | null;
};

export type StockIngredient = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  units?: IngredientUnitRow[];
  category: string;
  itemKind: string;
  qty: number;
  cost: number;
  referenceCost: number;
  min: number;
  max: number;
  reorder: number;
  status: StockStatus;
  lastCount: string;
  temp: string | null;
  locationBreakdown?: StockLocationBreakdown[];
};

export type StockWorkSummary = {
  underThresholdCount: number;
  pendingGrnCount: number;
  pendingTransferCount: number;
  pendingWorkCount: number;
};

export type StockActionPermissions = {
  canReceiveGrn: boolean;
  canReceiveTransfer: boolean;
  canCreateIssue: boolean;
  canCreateTransfer: boolean;
  canCreateStocktake: boolean;
  canWriteoff: boolean;
  canCreatePurchaseOrder: boolean;
  canAdjustException: boolean;
};

export interface StockOnHandPageData {
  branchId: number;
  branchValue: number | null;
  coreDataLoadFailed: boolean;
  ingredients: StockIngredient[];
  permissions: StockActionPermissions;
  summary: StockWorkSummary;
  totalValue: number | null;
}

export interface StockOnHandFilters {
  category: string;
  location: StockLocationFilter;
  query: string;
  status: StockFilter;
}

const STATUS_PRIORITY: Record<StockStatus, number> = {
  out: 0,
  low: 1,
  over: 2,
  normal: 3,
};

export function computeStockStatus(
  qty: number,
  min: number,
  max: number,
): StockStatus {
  if (qty <= 0) return "out";
  if (qty < min) return "low";
  if (max > 0 && qty > max) return "over";
  return "normal";
}

export function isStockReorderRisk(item: StockIngredient): boolean {
  return (
    item.status === "out" || item.status === "low" || item.qty <= item.reorder
  );
}

export function stockLocationLabel(row: StockLocationBreakdown): string {
  if (row.locationKind === "warehouse") {
    return messages.inventory.stock.filters.locationWarehouse;
  }
  if (row.locationKind === "kitchen") {
    return messages.inventory.stock.filters.locationKitchen;
  }
  return row.name;
}

export function visibleStockLocationRows(
  rows: StockLocationBreakdown[] = [],
): StockLocationBreakdown[] {
  return rows.filter((row) => row.qty !== 0);
}

export function shouldShowStockLocationBreakdown(
  rows: StockLocationBreakdown[] = [],
): boolean {
  const visibleRows = visibleStockLocationRows(rows);
  return (
    visibleRows.length > 1 ||
    visibleRows.some((row) => row.locationKind === "kitchen")
  );
}

export function scopeStockIngredientToLocation(
  ingredient: StockIngredient,
  location: StockLocationFilter,
): StockIngredient {
  if (location === "all") return ingredient;

  const rows =
    ingredient.locationBreakdown?.filter(
      (row) => row.locationKind === location,
    ) ?? [];
  const qty = rows.reduce((sum, row) => sum + row.qty, 0);
  const costBasis = rows.reduce(
    (sum, row) => sum + row.qty * (row.avgUnitCost ?? ingredient.referenceCost),
    0,
  );
  const latestCount = rows
    .map((row) => row.lastCountedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    ...ingredient,
    qty,
    cost: qty > 0 ? costBasis / qty : ingredient.cost,
    status: computeStockStatus(qty, ingredient.min, ingredient.max),
    lastCount: latestCount
      ? formatVNDate(latestCount)
      : messages.inventory.common.noValue,
    locationBreakdown: rows,
  };
}

export function getStockOnHandCategories(ingredients: StockIngredient[]) {
  const categories = [
    ...new Set(
      ingredients.map((ingredient) => ingredient.category).filter(Boolean),
    ),
  ];
  categories.sort((left, right) => left.localeCompare(right, "vi"));

  return {
    categories,
    hasUncategorized: ingredients.some((ingredient) => !ingredient.category),
  };
}

export function hasStockOnHandFilters(filters: StockOnHandFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.category !== STOCK_ALL_CATEGORY_VALUE ||
    filters.status !== "all" ||
    filters.location !== "all"
  );
}

export function isPristineStockOnHand(ingredients: StockIngredient[]): boolean {
  return (
    ingredients.length > 0 &&
    ingredients.every(
      (item) =>
        item.qty === 0 &&
        (!item.lastCount ||
          item.lastCount === messages.inventory.common.noValue),
    )
  );
}

export function filterStockOnHandIngredients(
  ingredients: StockIngredient[],
  filters: StockOnHandFilters,
): StockIngredient[] {
  let result = ingredients.map((ingredient) =>
    scopeStockIngredientToLocation(ingredient, filters.location),
  );

  if (filters.category === STOCK_NO_CATEGORY_VALUE) {
    result = result.filter((ingredient) => !ingredient.category);
  } else if (filters.category !== STOCK_ALL_CATEGORY_VALUE) {
    result = result.filter(
      (ingredient) => ingredient.category === filters.category,
    );
  }

  if (filters.status === "in_stock") {
    result = result.filter(
      (ingredient) =>
        ingredient.status === "normal" || ingredient.status === "over",
    );
  } else if (filters.status === "low") {
    result = result.filter(isStockReorderRisk);
  } else if (filters.status === "out") {
    result = result.filter((ingredient) => ingredient.status === "out");
  }

  if (filters.query.trim()) {
    result = result.filter((ingredient) =>
      matchesSearch([ingredient.name, ingredient.sku], filters.query),
    );
  }

  return [...result].sort(
    (left, right) =>
      STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status] ||
      Number(isStockReorderRisk(right)) - Number(isStockReorderRisk(left)) ||
      left.name.localeCompare(right.name, "vi"),
  );
}
