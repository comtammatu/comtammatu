import type { IngredientUnitRow } from "@lib/inventory/types";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";

export const STOCK_ALL_CATEGORY_VALUE = "all";
export const STOCK_NO_CATEGORY_VALUE = "__none__";

export type StockStatus = "normal" | "low" | "out";
export type StockFilter = "all" | "in_stock" | "low" | "out";

/** Branch/owner land default: hide out-of-stock rows. */
export const STOCK_ON_HAND_DEFAULT_STATUS: StockFilter = "in_stock";

export type StockLocationBreakdown = {
  locationId: number;
  name: string;
  code: string;
  locationKind: string;
  qty: number;
  monetary: { avgUnitCost: number | null } | null;
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
  monetary: {
    averageUnitCost: number | null;
  } | null;
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
};

export type StockActionPermissions = {
  canCreateStockRequest: boolean;
  /** L0 / central GRN receive CTA (D093 — not branch). */
  canReceiveGrn: boolean;
  canManagePurchaseRequest: boolean;
  canReceiveTransfer: boolean;
  canCreateIssue: boolean;
  canCreateTransfer: boolean;
  canCreateStocktake: boolean;
  canWriteoff: boolean;
  canAdjustException: boolean;
  /** Owner-only ingredient catalog edit from stock card. */
  canEditIngredient: boolean;
  /** Owner-only company WAC restatement (ISS-06). */
  canSetCompanyWac: boolean;
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
  /** Empty or only ALL sentinel → no category facet. Multiple values OR-match. */
  categories: string[];
  query: string;
  status: StockFilter;
}

const STATUS_PRIORITY: Record<StockStatus, number> = {
  normal: 0,
  low: 1,
  out: 2,
};

export function computeStockStatus(qty: number, min: number): StockStatus {
  if (qty <= 0) return "out";
  if (min > 0 && qty <= min) return "low";
  return "normal";
}

export function isStockReorderRisk(item: StockIngredient): boolean {
  return item.status === "out" || item.status === "low";
}

export function stockLocationLabel(row: StockLocationBreakdown): string {
  if (row.locationKind === "warehouse") {
    return messages.inventory.stock.filters.locationWarehouse;
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
  return visibleRows.length > 1;
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

export function normalizeStockOnHandCategories(
  categories: readonly string[],
): string[] {
  const unique = [
    ...new Set(
      categories.filter(
        (value) => value !== STOCK_ALL_CATEGORY_VALUE && value.length > 0,
      ),
    ),
  ];
  unique.sort((left, right) => left.localeCompare(right, "vi"));
  return unique;
}

export function hasStockOnHandFilters(filters: StockOnHandFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    normalizeStockOnHandCategories(filters.categories).length > 0 ||
    filters.status !== STOCK_ON_HAND_DEFAULT_STATUS
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
  let result = [...ingredients];
  const categories = normalizeStockOnHandCategories(filters.categories);

  if (categories.length > 0) {
    const includeUncategorized = categories.includes(STOCK_NO_CATEGORY_VALUE);
    const named = new Set(
      categories.filter((value) => value !== STOCK_NO_CATEGORY_VALUE),
    );
    result = result.filter((ingredient) => {
      if (!ingredient.category) return includeUncategorized;
      return named.has(ingredient.category);
    });
  }

  if (filters.status === "in_stock") {
    // Còn hàng: anything with qty left (normal + low), hide hết hàng.
    result = result.filter((ingredient) => ingredient.status !== "out");
  } else if (filters.status === "low") {
    result = result.filter((ingredient) => ingredient.status === "low");
  } else if (filters.status === "out") {
    result = result.filter((ingredient) => ingredient.status === "out");
  }

  if (filters.query.trim()) {
    result = result.filter((ingredient) =>
      matchesSearch([ingredient.name, ingredient.sku], filters.query),
    );
  }

  // Còn hàng → Chạm ngưỡng → Hết hàng; name tiebreak within status.
  return [...result].sort(
    (left, right) =>
      STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status] ||
      left.name.localeCompare(right.name, "vi"),
  );
}
