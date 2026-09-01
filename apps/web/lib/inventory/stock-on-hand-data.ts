import "server-only";

import { notFound, redirect } from "next/navigation";
import {
  getInventoryValueVisibility,
  INGREDIENT_CATALOG_WRITE_ROLES,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import { normalizeInventoryLocationNameVi } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermission,
} from "@/_lib/permissions";
import { fetchIngredients } from "@/(protected)/inventory/ingredient-actions";
import { formatDate } from "@lib/inventory/format";
import { CATALOG_MANAGE_PERMISSIONS } from "@/(protected)/inventory/_lib/catalog-permissions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { fetchStockBearingLocationIds } from "@/(protected)/inventory/_lib/stock-bearing-locations";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import type { IngredientUnitRow } from "@lib/inventory/types";
import {
  computeStockStatus,
  isStockReorderRisk,
  type StockActionPermissions,
  type StockIngredient,
  type StockLocationBreakdown,
  type StockOnHandPageData,
  type StockWorkSummary,
} from "./stock-on-hand-model";
import { loadInventoryMonetaryAccess } from "./monetary-access";
import { resolveStockDisplayUnit } from "@/(protected)/inventory/_lib/stock-unit-format";
import {
  buildBranchMinimumMap,
  resolveEffectiveMinimum,
} from "./branch-stock-threshold-model";

type StockLevelLocationRow = {
  id: number;
  name: string | null;
  code: string | null;
  location_kind: string | null;
};

type StockLevelRow = {
  ingredient_id: number;
  location_id: number;
  current_quantity: number;
  avg_unit_cost: number | null;
  last_counted_at: string | null;
  inventory_locations: StockLevelLocationRow | StockLevelLocationRow[] | null;
};

type TenantStockLevelRow = {
  current_quantity: number | null;
  avg_unit_cost: number | null;
};

type ValuationAccountRow = {
  book_value: number | null;
};

type LocationThresholdRow = {
  ingredient_id: number;
  location_id?: number | null;
  min_stock_level: number | null;
};

type StockIngredientRow = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  item_kind: string | null;
  min_stock_level: number | null;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string | null;
  is_active: boolean;
  units?: IngredientUnitRow[];
};

interface LoadStockOnHandPageDataOptions {
  includeValuation?: boolean;
  queryBranch?: string | string[];
  routeBranchId?: number;
}

const LOCATION_KIND_ORDER: Record<string, number> = {
  warehouse: 0,
  receiving: 1,
  production_storage: 2,
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function locationKindRank(locationKind: string): number {
  return LOCATION_KIND_ORDER[locationKind] ?? 99;
}

function inventoryLineValue(
  quantityBase: number | null,
  avgUnitCost: number | null,
): number {
  return (quantityBase ?? 0) * (avgUnitCost ?? 0);
}

function storageTemp(type: string | null): string | null {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return null;
}

export async function loadStockOnHandPageData({
  includeValuation = true,
  queryBranch,
  routeBranchId,
}: LoadStockOnHandPageDataOptions = {}): Promise<StockOnHandPageData> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranch,
  });
  if (scope.outOfScope) notFound();

  const branchId = scope.selectedBranchId;
  // On-hand is site-scoped (locations/WAC). Aggregate `all` cannot render a
  // coherent stock board — pin to the default operable site and keep URL sync.
  if (!branchId) {
    if (scope.canSelectAll && scope.defaultBranchId != null) {
      redirect(
        withControlSurfaceBranchScope(
          "/inventory/stock",
          String(scope.defaultBranchId) as `${number}`,
          { prefixes: ["/inventory"] },
        ),
      );
    }
    notFound();
  }

  const monetaryAccess = await loadInventoryMonetaryAccess(claims.user_role);
  const stockReadClient = monetaryAccess.valuation
    ? (monetaryAccess.client ?? supabase)
    : supabase;
  const { data: valuationCutover, error: valuationCutoverError } =
    includeValuation && monetaryAccess.valuation
      ? await stockReadClient
          .from("inventory_valuation_cutovers")
          .select("status")
          .eq("tenant_id", claims.tenant_id)
          .maybeSingle()
      : { data: null, error: null };
  const valuationActive = valuationCutover?.status === "active";
  const stockBearingLocations = await fetchStockBearingLocationIds({
    supabase: stockReadClient,
    tenantId: claims.tenant_id,
    branchId,
  });
  const stockBearingLocationIds = stockBearingLocations.ok
    ? stockBearingLocations.locationIds
    : [];
  const locations = stockBearingLocations.ok
    ? stockBearingLocations.locations
        .map((location) => ({
          id: location.id,
          name:
            normalizeInventoryLocationNameVi(location.name) ||
            (location.location_kind === "kitchen" ? "Bếp" : "Kho"),
          kind: location.location_kind ?? "unknown",
        }))
        .sort((left, right) => {
          if (left.kind === right.kind)
            return left.name.localeCompare(right.name, "vi");
          if (left.kind === "kitchen") return -1;
          if (right.kind === "kitchen") return 1;
          return 0;
        })
    : [];
  const defaultLocationId = stockBearingLocations.ok
    ? (stockBearingLocations.locations.find(
        (location) => location.default_consumption,
      )?.id ??
      stockBearingLocations.locations.find(
        (location) => location.location_kind === "warehouse",
      )?.id ??
      null)
    : null;
  const stockLevelQuery = monetaryAccess.valuation
    ? stockReadClient
        .from("stock_levels")
        .select(
          "ingredient_id, location_id, current_quantity, avg_unit_cost, last_counted_at, inventory_locations ( id, name, code, location_kind )",
        )
    : stockReadClient
        .from("stock_levels")
        .select(
          "ingredient_id, location_id, current_quantity, last_counted_at, inventory_locations ( id, name, code, location_kind )",
        );

  const [
    ingredientsResult,
    stockResult,
    thresholdResult,
    canCreateStockRequest,
    canReceiveGrn,
    canManagePurchaseRequest,
    canReceiveTransfer,
    canCreateTransfer,
    canCreateStocktake,
    canWriteoff,
    canAdjustException,
    canManageCatalog,
  ] = await Promise.all([
    fetchIngredients(),
    stockBearingLocations.ok && stockBearingLocationIds.length > 0
      ? stockLevelQuery
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", branchId)
          .in("location_id", stockBearingLocationIds)
          .order("ingredient_id")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("branch_ingredient_thresholds")
      .select("*")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .eq("is_active", true),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_REQUEST_CREATE,
    ),
    currentUserHasPermission(branchId, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_TRANSFER_RECEIVE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    ),
    currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    ),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITEOFF),
    currentUserHasPermission(branchId, PERMISSION_KEYS.INVENTORY_WRITE),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
  ]);

  const canEditIngredient =
    INGREDIENT_CATALOG_WRITE_ROLES.includes(claims.user_role) &&
    canManageCatalog;
  const canSetCompanyWac = claims.user_role === "owner";

  // Fail-soft: a denied/failed ingredient catalog read degrades to an empty
  // list + coreDataLoadFailed flag instead of crashing the whole page. Stock
  // levels, permissions and summary stay usable. Matches catalog/page.tsx.
  // inventory.stock.ingredients_load_failed
  let dbIngredients: StockIngredientRow[] = [];
  if (ingredientsResult.success) {
    dbIngredients = (ingredientsResult.data ?? []) as StockIngredientRow[];
  }
  const stockRows = (stockResult.data ?? []) as StockLevelRow[];
  const thresholdRows = (thresholdResult.data ??
    []) as unknown as LocationThresholdRow[];
  const defaultThresholdRows = thresholdRows.filter(
    (row) => row.location_id == null || row.location_id === defaultLocationId,
  );
  const branchMinimums = buildBranchMinimumMap(
    defaultThresholdRows.map((row) => ({
      ingredient_id: row.ingredient_id,
      min_stock_level: Number(row.min_stock_level ?? 0),
    })),
  );
  const locationMinimumsByIngredient = new Map<
    number,
    Record<number, number>
  >();
  for (const threshold of thresholdRows) {
    if (threshold.location_id == null) continue;
    const minimums =
      locationMinimumsByIngredient.get(threshold.ingredient_id) ?? {};
    minimums[threshold.location_id] = Number(threshold.min_stock_level ?? 0);
    locationMinimumsByIngredient.set(threshold.ingredient_id, minimums);
  }
  const stockMap = new Map<
    number,
    {
      ingredientId: number;
      currentQuantity: number;
      avgUnitCost: number | null;
      lastCountedAt: string | null;
    }
  >();
  const locationMap = new Map<number, StockLocationBreakdown[]>();

  for (const row of stockRows) {
    const location = relatedOne(row.inventory_locations);
    const locations = locationMap.get(row.ingredient_id) ?? [];
    locations.push({
      locationId: row.location_id,
      name:
        normalizeInventoryLocationNameVi(location?.name) ||
        location?.code ||
        `#${row.location_id}`,
      code: location?.code ?? "",
      locationKind: location?.location_kind ?? "unknown",
      qty: row.current_quantity,
      monetary: monetaryAccess.valuation
        ? { avgUnitCost: row.avg_unit_cost }
        : null,
      lastCountedAt: row.last_counted_at,
    });
    locationMap.set(row.ingredient_id, locations);

    const previous = stockMap.get(row.ingredient_id);
    if (!previous) {
      stockMap.set(row.ingredient_id, {
        ingredientId: row.ingredient_id,
        currentQuantity: row.current_quantity,
        avgUnitCost: row.avg_unit_cost,
        lastCountedAt: row.last_counted_at,
      });
      continue;
    }

    const totalQuantity = previous.currentQuantity + row.current_quantity;
    const weightedCost =
      totalQuantity > 0
        ? (previous.currentQuantity * (previous.avgUnitCost ?? 0) +
            row.current_quantity * (row.avg_unit_cost ?? 0)) /
          totalQuantity
        : (row.avg_unit_cost ?? previous.avgUnitCost);
    const latestCount =
      previous.lastCountedAt && row.last_counted_at
        ? previous.lastCountedAt > row.last_counted_at
          ? previous.lastCountedAt
          : row.last_counted_at
        : (previous.lastCountedAt ?? row.last_counted_at);

    stockMap.set(row.ingredient_id, {
      ingredientId: row.ingredient_id,
      currentQuantity: totalQuantity,
      avgUnitCost: weightedCost,
      lastCountedAt: latestCount,
    });
  }

  for (const locations of locationMap.values()) {
    locations.sort((left, right) => {
      const kindDifference =
        locationKindRank(left.locationKind) -
        locationKindRank(right.locationKind);
      if (kindDifference !== 0) return kindDifference;
      return left.name.localeCompare(right.name, "vi");
    });
  }

  const valueVisibility = getInventoryValueVisibility(
    monetaryAccess.valuation,
    claims.user_role === "owner",
  );
  const canViewTotal = valueVisibility.system;
  const canViewBranch = valueVisibility.branch;
  // Strip purchase/WAC unit costs when the role or surface denies valuation.
  const showUnitCosts = includeValuation && monetaryAccess.valuation;

  const ingredients: StockIngredient[] = dbIngredients
    .filter((row) => {
      const currentQuantity = stockMap.get(row.id)?.currentQuantity ?? 0;
      return row.is_active || currentQuantity > 0;
    })
    .map((row) => {
      const stock = stockMap.get(row.id);
      const qty = stock?.currentQuantity ?? 0;
      const averageUnitCost = stock?.avgUnitCost ?? null;
      const min = resolveEffectiveMinimum(
        row.min_stock_level,
        branchMinimums,
        row.id,
      );
      const max = row.max_stock_level ?? 0;
      const reorder = row.reorder_point ?? 0;
      const locationBreakdown = locationMap.get(row.id) ?? [];

      const standardUnit = resolveStockDisplayUnit(row.units);
      return {
        id: row.id,
        name: row.name,
        sku: row.sku ?? "",
        unit:
          standardUnit?.unit_name?.trim() ||
          standardUnit?.unit_code ||
          row.unit,
        units: row.units,
        category: row.category ?? "",
        itemKind: row.item_kind ?? "raw_material",
        qty,
        monetary: showUnitCosts
          ? {
              averageUnitCost,
            }
          : null,
        min,
        locationMinimums: locationMinimumsByIngredient.get(row.id),
        max,
        reorder,
        status: computeStockStatus(qty, min),
        lastCount: stock?.lastCountedAt ? formatDate(stock.lastCountedAt) : "—",
        temp: storageTemp(row.storage_type),
        locationBreakdown,
      };
    });
  let branchValue: number | null = null;
  let branchValuationLoadFailed = false;
  if (includeValuation && canViewBranch) {
    if (valuationActive) {
      const { data: branchAccounts, error: branchAccountsError } =
        stockBearingLocationIds.length > 0
          ? await stockReadClient
              .from("inventory_valuation_accounts")
              .select("book_value")
              .eq("tenant_id", claims.tenant_id)
              .eq("branch_id", branchId)
              .in("location_id", stockBearingLocationIds)
          : { data: [], error: null };
      branchValuationLoadFailed = branchAccountsError != null;
      if (!branchValuationLoadFailed) {
        branchValue = ((branchAccounts ?? []) as ValuationAccountRow[]).reduce(
          (sum, row) => sum + Number(row.book_value ?? 0),
          0,
        );
      }
    } else if (valuationCutoverError == null) {
      branchValue = ingredients.reduce(
        (sum, ingredient) =>
          sum +
          inventoryLineValue(
            ingredient.qty,
            ingredient.monetary?.averageUnitCost ?? null,
          ),
        0,
      );
    }
  }

  let totalValue: number | null = null;
  let tenantStockBearingLoadFailed = false;
  if (includeValuation && canViewTotal) {
    const tenantStockBearingLocations = await fetchStockBearingLocationIds({
      supabase: monetaryAccess.client ?? supabase,
      tenantId: claims.tenant_id,
    });
    if (!tenantStockBearingLocations.ok) {
      tenantStockBearingLoadFailed = true;
    } else {
      const tenantStockBearingLocationIds =
        tenantStockBearingLocations.locationIds;
      const { data: tenantRows, error: tenantValueError } =
        tenantStockBearingLocationIds.length > 0
          ? valuationActive
            ? await (monetaryAccess.client ?? supabase)
                .from("inventory_valuation_accounts")
                .select("book_value")
                .eq("tenant_id", claims.tenant_id)
                .in("location_id", tenantStockBearingLocationIds)
            : await (monetaryAccess.client ?? supabase)
                .from("stock_levels")
                .select("current_quantity, avg_unit_cost")
                .eq("tenant_id", claims.tenant_id)
                .in("location_id", tenantStockBearingLocationIds)
          : { data: [], error: null };
      if (tenantValueError != null || valuationCutoverError != null) {
        tenantStockBearingLoadFailed = true;
      } else {
        totalValue = valuationActive
          ? ((tenantRows ?? []) as ValuationAccountRow[]).reduce(
              (sum, row) => sum + Number(row.book_value ?? 0),
              0,
            )
          : ((tenantRows ?? []) as TenantStockLevelRow[]).reduce(
              (sum, row) =>
                sum +
                inventoryLineValue(row.current_quantity, row.avg_unit_cost),
              0,
            );
      }
    }
  }

  const underThresholdCount = ingredients.filter(isStockReorderRisk).length;
  const summary: StockWorkSummary = { underThresholdCount };
  const permissions: StockActionPermissions = {
    canCreateStockRequest,
    canReceiveGrn,
    canManagePurchaseRequest,
    canReceiveTransfer,
    canCreateIssue: canAdjustException,
    canCreateTransfer,
    canCreateStocktake,
    canWriteoff,
    canAdjustException,
    canEditIngredient,
    canSetCompanyWac,
  };

  return {
    branchId,
    branchValue,
    coreDataLoadFailed:
      !stockBearingLocations.ok ||
      valuationCutoverError != null ||
      branchValuationLoadFailed ||
      tenantStockBearingLoadFailed ||
      !ingredientsResult.success ||
      stockResult.error != null ||
      thresholdResult.error != null,
    ingredients,
    locations,
    defaultLocationId,
    permissions,
    summary,
    totalValue,
  };
}
