import { matchesSearch } from "@lib/search";
import {
  catalogReadinessHasGap,
  type CatalogReadinessGap,
  type CatalogReadinessInput,
} from "@lib/inventory/catalog-readiness";

export type IngredientsActiveFilter = "active" | "all";

export type IngredientsReadinessFilter =
  | "all"
  | "gaps"
  | CatalogReadinessGap;

export type IngredientsListFilters = {
  query: string;
  category: string;
  itemKind: string;
  active: IngredientsActiveFilter;
  readiness: IngredientsReadinessFilter;
  page: number;
};

export const INGREDIENTS_ALL_KINDS = "all";
export const INGREDIENTS_DEFAULT_PAGE_SIZE = 25;

const READINESS_FILTER_VALUES = [
  "all",
  "gaps",
  "missing_fulfill_site",
  "missing_supplier_link",
] as const satisfies readonly IngredientsReadinessFilter[];

export function parseIngredientsActiveFilter(
  value: string | null,
): IngredientsActiveFilter {
  return value === "all" ? "all" : "active";
}

export function parseIngredientsReadinessFilter(
  value: string | null,
): IngredientsReadinessFilter {
  return READINESS_FILTER_VALUES.includes(
    value as IngredientsReadinessFilter,
  )
    ? (value as IngredientsReadinessFilter)
    : "all";
}

export function parseIngredientsListPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseIngredientsListFilters(
  params: URLSearchParams,
): IngredientsListFilters {
  return {
    query: params.get("q") ?? "",
    category: params.get("category") || "all",
    itemKind: params.get("kind") || INGREDIENTS_ALL_KINDS,
    active: parseIngredientsActiveFilter(params.get("active")),
    readiness: parseIngredientsReadinessFilter(params.get("ready")),
    page: parseIngredientsListPage(params.get("page")),
  };
}

export function hasIngredientsListFilters(
  filters: IngredientsListFilters,
): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.category !== "all" ||
    filters.itemKind !== INGREDIENTS_ALL_KINDS ||
    filters.active !== "active" ||
    filters.readiness !== "all"
  );
}

export type IngredientsListFilterPatch = Partial<{
  q: string | null;
  category: string | null;
  kind: string | null;
  active: IngredientsActiveFilter | null;
  ready: IngredientsReadinessFilter | null;
  page: number | null;
}>;

/** Apply filter patch; non-default values are written, defaults removed. */
export function applyIngredientsListFilterPatch(
  current: URLSearchParams,
  patch: IngredientsListFilterPatch,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());

  if (patch.q !== undefined) {
    const trimmed = patch.q?.trim() ?? "";
    if (!trimmed) next.delete("q");
    else next.set("q", trimmed);
  }

  if (patch.category !== undefined) {
    if (!patch.category || patch.category === "all") next.delete("category");
    else next.set("category", patch.category);
  }

  if (patch.kind !== undefined) {
    if (!patch.kind || patch.kind === INGREDIENTS_ALL_KINDS) next.delete("kind");
    else next.set("kind", patch.kind);
  }

  if (patch.active !== undefined) {
    if (!patch.active || patch.active === "active") next.delete("active");
    else next.set("active", patch.active);
  }

  if (patch.ready !== undefined) {
    if (!patch.ready || patch.ready === "all") next.delete("ready");
    else next.set("ready", patch.ready);
  }

  if (patch.page !== undefined) {
    if (patch.page == null || patch.page <= 1) next.delete("page");
    else next.set("page", String(patch.page));
  }

  return next;
}

function categoryLabel(item: {
  category_name?: string | null;
  category?: string | null;
}): string | null {
  return item.category_name ?? item.category ?? null;
}

type IngredientListFilterRow = {
  name: string;
  sku: string | null;
  item_kind: string;
  is_active: boolean;
  category_name?: string | null;
  category?: string | null;
};

export function filterIngredientListRows<T extends IngredientListFilterRow>(
  rows: readonly T[],
  filters: Omit<IngredientsListFilters, "page">,
  toReadiness: (row: T) => CatalogReadinessInput,
): T[] {
  let result = [...rows];

  if (filters.active === "active") {
    result = result.filter((item) => item.is_active);
  }
  if (filters.category !== "all") {
    result = result.filter(
      (item) => categoryLabel(item) === filters.category,
    );
  }
  if (filters.itemKind !== INGREDIENTS_ALL_KINDS) {
    result = result.filter((item) => item.item_kind === filters.itemKind);
  }
  if (filters.readiness !== "all") {
    const gap =
      filters.readiness === "gaps"
        ? "any"
        : (filters.readiness as CatalogReadinessGap);
    result = result.filter((item) =>
      catalogReadinessHasGap(toReadiness(item), gap),
    );
  }
  if (filters.query.trim()) {
    result = result.filter((item) =>
      matchesSearch([item.name, item.sku], filters.query),
    );
  }

  return result;
}

export function supplierCatalogLinkHref(ingredientId: number): string {
  return `/inventory/suppliers?ingredientId=${ingredientId}`;
}
